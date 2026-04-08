use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use etcd_client::{SortOrder, SortTarget};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;
use tokio::sync::Mutex;

use crate::core::{
    self, CountResult, KeysOnlySplitter, KvSplitter, key_after, range_end_of_prefix,
};
use crate::snapshot::{CacheSegment, KvEntry};
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
    },
    PageChunk {
        items: Vec<KvEntry>,
    },
    Progress {
        scanned: i64,
        matched: i64,
        total: Option<i64>,
    },
    Completed {
        total: i64,
        page: i64,
        page_size: i64,
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
    let current_page = query.current_page.max(1);
    let page_size = query.page_size.max(1);
    let range = query.prefix.as_bytes().to_vec()..range_end_of_prefix(query.prefix.as_bytes());
    let (page_start, _) = page_bounds(current_page, page_size);

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
    let range_count = if let Some(range_count) = range_count {
        snapshot
            .write()
            .await
            .set_range_count(range.clone(), range_count);
        range_count
    } else {
        range_count = snapshot.read().await.range_count(&range);
        if let Some(range_count) = range_count {
            range_count
        } else {
            // Snapshot at revision exists but doesn't have count for the range, need to fetch it
            let count = core::count_keys(range.clone(), Some(revision), state)
                .await
                .map_err(|e| e.to_string())?;
            snapshot
                .write()
                .await
                .set_range_count(range.clone(), count.total);
            count.total
        }
    };

    // Event: Started
    on_event
        .send(QueryEvent::Started {
            resolved_revision: revision,
            total: query.search.is_empty().then_some(range_count),
        })
        .map_err(|e| e.to_string())?;

    let (_, page_end) = page_bounds(current_page, page_size);
    let sort = (SortTarget::Key, SortOrder::Ascend);

    // Ask the snapshot which parts of the range are cached vs missing.
    let segments = snapshot.read().await.break_range(&range);
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
    let segment_count = segments.len();

    for (i, segment) in segments.into_iter().enumerate() {
        let false = cancelled.load(Ordering::Relaxed) else {
            return Err(CANCELLED_ERROR.to_string());
        };

        let mut snapshot_locked = snapshot.write().await;
        let segment_kvs = match (segment, query.load_mode) {
            (CacheSegment::Missing { range }, LoadMode::Full) => snapshot_locked
                .scan_and_merge_entries(state, KvSplitter, range, sort, revision)
                .await
                .map_err(|e| e.to_string())?,
            (CacheSegment::Missing { range }, _) => snapshot_locked
                .scan_and_merge_entries(state, KeysOnlySplitter, range, sort, revision)
                .await
                .map_err(|e| e.to_string())?,
            (CacheSegment::CachedKeys { range, .. }, LoadMode::Full) => snapshot_locked
                .scan_and_merge_entries(state, KvSplitter, range, sort, revision)
                .await
                .map_err(|e| e.to_string())?,
            (CacheSegment::CachedKeys { entries, .. }, _) => entries,
            (CacheSegment::CachedKv { entries, .. }, _) => entries,
        };

        // Apply search filter
        filtered_kvs.extend(segment_kvs.into_iter().filter(|kv| {
            query.search.is_empty()
                || kv.key.contains(&query.search)
                || kv.value.as_ref().is_some_and(|v| v.contains(&query.search))
        }));

        // Check if we can send the current page
        if page_sent || filtered_kvs.len() < page_end && i + 1 != segment_count {
            continue;
        }
        let end = page_end.min(filtered_kvs.len());
        let start = page_start.min(end);
        let page_kvs = &filtered_kvs[start..end];

        let page_kvs = if page_kvs.iter().any(|kv| kv.value.is_none()) {
            // Fetch values for the current page if any of the entries are missing values
            let range = page_kvs[0].key.as_bytes().to_owned()
                ..key_after(page_kvs[page_kvs.len() - 1].key.as_bytes());
            snapshot_locked
                .scan_and_merge_entries(state, KvSplitter, range, sort, revision)
                .await
                .map_err(|e| e.to_string())?
        } else {
            page_kvs.to_vec()
        };

        on_event
            .send(QueryEvent::PageChunk { items: page_kvs })
            .map_err(|e| e.to_string())?;
        page_sent = true;
    }

    on_event
        .send(QueryEvent::Completed {
            total: filtered_kvs.len() as i64,
            page: current_page,
            page_size,
        })
        .map_err(|e| e.to_string())?;

    Ok(())
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
    use super::page_bounds;

    #[test]
    fn page_bounds_are_one_based() {
        assert_eq!(page_bounds(1, 20), (0, 20));
        assert_eq!(page_bounds(3, 20), (40, 60));
    }
}
