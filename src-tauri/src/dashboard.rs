use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use etcd_client::{SortOrder, SortTarget};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;
use tokio::sync::Mutex;

use crate::core::{
    self, BatchFetcher, CountResult, KeysOnlySplitter, KvSplitter, key_after, range_end_of_prefix,
};
use crate::snapshot::{CacheSegment, KvEntry, SnapshotStore};
use crate::state::AppState;

const CANCELLED_ERROR: &str = "__dashboard_cancelled__";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum LoadMode {
    Full,
    Lazy,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub prefix: String,
    pub search: String,
    pub current_page: i64,
    pub page_size: i64,
    pub load_mode: LoadMode,
    pub revision: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
/// Streaming events emitted while a dashboard query is being resolved.
pub enum QueryEvent {
    Started {
        resolved_revision: i64,
        total: Option<i64>,
        source_total: i64,
    },
    PageChunk {
        items: Vec<KvEntry>,
    },
    Progress {
        scanned: i64,
        matched: i64,
        source_total: i64,
    },
    Completed {
        total: i64,
    },
    Error {
        message: String,
    },
}

fn page_bounds(current_page: i64, page_size: i64) -> (usize, usize) {
    let page_start = ((current_page.max(1) - 1) * page_size.max(1)) as usize;
    let page_end = page_start + page_size.max(1) as usize;
    (page_start, page_end)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct QueryProgressState {
    scanned: i64,
    matched: i64,
    source_total: i64,
}

impl QueryProgressState {
    fn new(source_total: i64) -> Self {
        Self {
            source_total,
            ..Self::default()
        }
    }

    fn record_entries<F>(&mut self, entries: &[KvEntry], search_filter: &F)
    where
        F: Fn(&KvEntry) -> bool,
    {
        self.scanned += entries.len() as i64;
        self.matched += entries.iter().filter(|entry| search_filter(entry)).count() as i64;
    }

    fn emit(&self, on_event: &Channel<QueryEvent>) -> Result<(), String> {
        on_event
            .send(QueryEvent::Progress {
                scanned: self.scanned.min(self.source_total),
                matched: self.matched,
                source_total: self.source_total,
            })
            .map_err(|e| e.to_string())
    }
}

async fn run_dashboard_query(
    state: &mut AppState,
    profile_fingerprint: u64,
    query: &QueryRequest,
    on_event: &Channel<QueryEvent>,
    cancelled: &Arc<AtomicBool>,
) -> Result<(), String> {
    log::debug!(
        "Running dashboard query for profile {} with prefix='{}', search='{}', page={}, page_size={}, load_mode={:?}, revision={:?}",
        profile_fingerprint,
        query.prefix,
        query.search,
        query.current_page,
        query.page_size,
        query.load_mode,
        query.revision
    );
    let range = query.prefix.as_bytes().to_vec()..range_end_of_prefix(query.prefix.as_bytes());
    let (page_start, page_end) = page_bounds(query.current_page, query.page_size);
    let sort = (SortTarget::Key, SortOrder::Ascend);
    let search_filter = |kv: &KvEntry| {
        query.search.is_empty()
            || kv.key.contains(&query.search)
            || kv.value.as_ref().is_some_and(|v| v.contains(&query.search))
    };

    let mut range_count = None;
    let revision = if let Some(revision) = query.revision {
        revision
    } else {
        // Unspecified revision, need to fetch latest revision
        let CountResult { total, revision } = core::count_keys(range.clone(), None, state)
            .await
            .map_err(|e| e.to_string())?;
        log::debug!("Fetched latest revision {} for dashboard query", revision);
        range_count = Some(total);
        revision
    };
    let snapshot = state
        .query_manager
        .snapshot_for(profile_fingerprint, revision);
    let mut snapshot = snapshot.lock().await;
    let range_count = if let Some(range_count) = range_count {
        snapshot.set_range_count(range.clone(), range_count);
        range_count
    } else {
        range_count = snapshot.range_count(&range);
        if let Some(range_count) = range_count {
            range_count
        } else {
            // Snapshot at revision exists but doesn't have count for the range, need to fetch it
            let count = core::count_keys(range.clone(), Some(revision), state)
                .await
                .map_err(|e| e.to_string())?;
            snapshot.set_range_count(range.clone(), count.total);
            count.total
        }
    };

    // Event: Started
    on_event
        .send(QueryEvent::Started {
            resolved_revision: revision,
            total: query.search.is_empty().then_some(range_count),
            source_total: range_count,
        })
        .map_err(|e| e.to_string())?;

    // Ask the snapshot which parts of the range are cached vs missing.
    let segments = snapshot.break_range(&range);
    log::debug!(
        "Dashboard query range broken into {} segments",
        segments.len()
    );
    for segment in &segments {
        match segment {
            CacheSegment::Missing { range } => {
                log::debug!(
                    "Segment missing from cache: {} - {}",
                    String::from_utf8_lossy(&range.start),
                    String::from_utf8_lossy(&range.end)
                );
            }
            CacheSegment::CachedKeys { range, entries } => {
                log::debug!(
                    "Segment with cached keys (no values): {} - {}, {} entries",
                    String::from_utf8_lossy(&range.start),
                    String::from_utf8_lossy(&range.end),
                    entries.len()
                );
            }
            CacheSegment::CachedKv { range, entries } => {
                log::debug!(
                    "Segment with cached keys and values: {} - {}, {} entries",
                    String::from_utf8_lossy(&range.start),
                    String::from_utf8_lossy(&range.end),
                    entries.len()
                );
            }
        }
    }

    let mut filtered_kvs: Vec<KvEntry> = Vec::new();
    let mut page_sent = false;
    let mut progress = QueryProgressState::new(range_count);

    for segment in segments.into_iter() {
        let false = cancelled.load(Ordering::Relaxed) else {
            return Err(CANCELLED_ERROR.to_string());
        };

        match (segment, query.load_mode) {
            // Segments requiring fetch — iterate batch-by-batch so the current
            // page can be sent as soon as enough entries are available.
            (CacheSegment::Missing { range }, LoadMode::Full)
            | (CacheSegment::CachedKeys { range, .. }, LoadMode::Full) => {
                let mut fetcher = BatchFetcher::new(KvSplitter, range.clone(), sort, revision);
                let mut all_entries = Vec::new();

                while let Some(batch) = fetcher.next_batch(state).await? {
                    if cancelled.load(Ordering::Relaxed) {
                        return Err(CANCELLED_ERROR.to_string());
                    }

                    progress.record_entries(&batch, &search_filter);
                    progress.emit(on_event)?;
                    all_entries.extend(batch.clone());
                    filtered_kvs.extend(batch.into_iter().filter(&search_filter));

                    if !page_sent && filtered_kvs.len() >= page_end {
                        send_page(
                            &filtered_kvs[page_start..page_end],
                            &mut snapshot,
                            state,
                            sort,
                            revision,
                            on_event,
                        )
                        .await?;
                        page_sent = true;
                    }
                }

                if !range.is_empty() && !all_entries.is_empty() {
                    snapshot.merge_scanned_range(range, all_entries);
                }
            }
            (CacheSegment::Missing { range }, _) => {
                let mut fetcher =
                    BatchFetcher::new(KeysOnlySplitter, range.clone(), sort, revision);
                let mut all_entries = Vec::new();

                while let Some(batch) = fetcher.next_batch(state).await? {
                    if cancelled.load(Ordering::Relaxed) {
                        return Err(CANCELLED_ERROR.to_string());
                    }

                    progress.record_entries(&batch, &search_filter);
                    progress.emit(on_event)?;
                    all_entries.extend(batch.clone());
                    filtered_kvs.extend(batch.into_iter().filter(&search_filter));

                    if !page_sent && filtered_kvs.len() >= page_end {
                        send_page(
                            &filtered_kvs[page_start..page_end],
                            &mut snapshot,
                            state,
                            sort,
                            revision,
                            on_event,
                        )
                        .await?;
                        page_sent = true;
                    }
                }

                if !range.is_empty() && !all_entries.is_empty() {
                    snapshot.merge_scanned_range(range, all_entries);
                }
            }
            // Cached segments — use directly.
            (CacheSegment::CachedKeys { entries, .. }, _)
            | (CacheSegment::CachedKv { entries, .. }, _) => {
                progress.record_entries(&entries, &search_filter);
                progress.emit(on_event)?;
                filtered_kvs.extend(entries.into_iter().filter(&search_filter));
            }
        }
    }

    // Scan finished before gathering enough entries to fill the page, send what we have.
    if !page_sent {
        let end = filtered_kvs.len().min(page_end);
        let start = page_start.min(end);
        send_page(
            &filtered_kvs[start..end],
            &mut snapshot,
            state,
            sort,
            revision,
            on_event,
        )
        .await?;
    }

    on_event
        .send(QueryEvent::Completed {
            total: filtered_kvs.len() as i64,
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Fetches missing values if needed, updates the snapshot,
/// and sends a [`QueryEvent::PageChunk`].
async fn send_page(
    paged_kvs: &[KvEntry],
    snapshot: &mut SnapshotStore,
    state: &mut AppState,
    sort: (SortTarget, SortOrder),
    revision: i64,
    on_event: &Channel<QueryEvent>,
) -> Result<(), String> {
    let page_kvs = if paged_kvs.iter().any(|kv| kv.value.is_none()) {
        // Fetch values for page entries that are missing them.
        let range = paged_kvs[0].key.as_bytes().to_owned()
            ..key_after(paged_kvs[paged_kvs.len() - 1].key.as_bytes());
        let mut fetcher = BatchFetcher::new(KvSplitter, range.clone(), sort, revision);
        let mut fetched_kvs = Vec::new();
        while let Some(batch) = fetcher.next_batch(state).await? {
            fetched_kvs.extend(batch);
        }
        snapshot.merge_scanned_range(range, fetched_kvs.clone());
        fetched_kvs
    } else {
        paged_kvs.to_vec()
    };

    on_event
        .send(QueryEvent::PageChunk { items: page_kvs })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_dashboard_query(
    query: QueryRequest,
    on_event: Channel<QueryEvent>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    log::debug!(
        "Starting dashboard query prefix={} page={} page_size={} mode={:?}",
        query.prefix,
        query.current_page,
        query.page_size,
        query.load_mode,
    );

    let mut app_state = state.lock().await;
    let profile_fingerprint = app_state
        .app_config
        .get_current_profile()
        .map(|p| p.fingerprint())
        .ok_or_else(|| "Could not get current profile fingerprint".to_string())?;
    let cancelled = app_state.query_manager.begin_dashboard_query();

    if let Err(error) = run_dashboard_query(
        &mut app_state,
        profile_fingerprint,
        &query,
        &on_event,
        &cancelled,
    )
    .await
    {
        if error == CANCELLED_ERROR {
            log::debug!("Dashboard query was superseded by a newer query");
            return Ok(());
        }

        log::error!("Dashboard query failed: {}", error);
        let message = if crate::client::is_invalid_auth_token_error(&error) {
            "Authentication expired and automatic reconnection failed.".to_string()
        } else {
            error
        };
        let _ = on_event.send(QueryEvent::Error { message });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::QueryEvent;
    use super::page_bounds;

    #[test]
    fn page_bounds_are_one_based() {
        assert_eq!(page_bounds(1, 20), (0, 20));
        assert_eq!(page_bounds(3, 20), (40, 60));
    }

    #[test]
    fn started_event_serializes_source_total_alongside_exact_total() {
        let payload = serde_json::to_value(QueryEvent::Started {
            resolved_revision: 42,
            total: Some(7),
            source_total: 9,
        })
        .expect("started event should serialize");

        assert_eq!(
            payload,
            json!({
                "event": "started",
                "data": {
                    "resolvedRevision": 42,
                    "total": 7,
                    "sourceTotal": 9,
                }
            })
        );
    }

    #[test]
    fn progress_event_serializes_source_total_instead_of_reusing_total() {
        let payload = serde_json::to_value(QueryEvent::Progress {
            scanned: 4,
            matched: 2,
            source_total: 9,
        })
        .expect("progress event should serialize");

        assert_eq!(
            payload,
            json!({
                "event": "progress",
                "data": {
                    "scanned": 4,
                    "matched": 2,
                    "sourceTotal": 9,
                }
            })
        );
    }
}
