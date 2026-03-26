use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;
use tauri::ipc::Channel;
use tokio::sync::Mutex;

use crate::client;
use crate::core;
use crate::snapshot::{KeyRange, SharedSnapshot, SnapshotKey, key_after};
use crate::state::AppState;

const CANCELLED_ERROR: &str = "__dashboard_cancelled__";
const SNAPSHOT_FETCH_CHUNK_SIZE: i64 = 2048;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum LoadMode {
    Full,
    Lazy,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub request_id: String,
    pub prefix: String,
    pub search: String,
    pub current_page: i64,
    pub page_size: i64,
    pub load_mode: LoadMode,
    pub revision: Option<i64>,
    pub preserve_pagination_state: bool,
}

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum QueryEvent {
    Started {
        request_id: String,
        mode: LoadMode,
        resolved_revision: i64,
        total: Option<i64>,
        preserve_pagination_state: bool,
    },
    PageChunk {
        items: Vec<client::KvEntry>,
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
    Cancelled,
    Error {
        message: String,
    },
}

struct ResolvedSnapshot {
    range: KeyRange,
    revision: i64,
    known_total: Option<i64>,
    snapshot: SharedSnapshot,
}

fn page_bounds(current_page: i64, page_size: i64) -> (usize, usize) {
    let page_start = ((current_page.max(1) - 1) * page_size.max(1)) as usize;
    let page_end = page_start + page_size.max(1) as usize;
    (page_start, page_end)
}

fn required_key_count(page_start: usize, page_size: i64, exact_total: i64) -> usize {
    (page_start + page_size.max(1) as usize).min(exact_total.max(0) as usize)
}

fn should_try_first_page_full_fast_path(
    current_page: i64,
    load_mode: LoadMode,
    snapshot_key_count: usize,
) -> bool {
    current_page == 1 && load_mode == LoadMode::Full && snapshot_key_count == 0
}

fn is_cancelled(cancelled: &Arc<AtomicBool>) -> bool {
    cancelled.load(Ordering::Relaxed)
}

fn check_cancelled(cancelled: &Arc<AtomicBool>) -> Result<(), String> {
    if is_cancelled(cancelled) {
        Err(CANCELLED_ERROR.to_string())
    } else {
        Ok(())
    }
}

fn send_event(on_event: &Channel<QueryEvent>, event: QueryEvent) -> Result<(), String> {
    on_event.send(event).map_err(|error| error.to_string())
}

fn matches_item(item: &client::KvEntry, search: &str, load_mode: LoadMode) -> bool {
    if search.is_empty() {
        return true;
    }
    item.key.contains(search) || (load_mode == LoadMode::Full && item.value.contains(search))
}

fn matches_key_bytes(key: &[u8], search: &str) -> bool {
    search.is_empty() || String::from_utf8_lossy(key).contains(search)
}

async fn acquire_client(state: &State<'_, Mutex<AppState>>) -> Result<etcd_client::Client, String> {
    let mut app_state = state.lock().await;
    Ok(app_state.get_client().await?.clone())
}

async fn refresh_client(state: &State<'_, Mutex<AppState>>) -> Result<etcd_client::Client, String> {
    let mut app_state = state.lock().await;
    app_state.etcd_client = None;
    Ok(app_state.get_client().await?.clone())
}

async fn resolve_snapshot(
    state: &State<'_, Mutex<AppState>>,
    client: &mut etcd_client::Client,
    profile_fingerprint: &str,
    query: &QueryRequest,
    has_search: bool,
) -> Result<ResolvedSnapshot, String> {
    let range = KeyRange::from_prefix(&query.prefix);

    if let Some(revision) = query.revision {
        let snapshot = state.lock().await.get_or_create_snapshot(SnapshotKey {
            profile_fingerprint: profile_fingerprint.to_string(),
            revision,
        });
        let started_total = if has_search {
            None
        } else if let Some(total) = snapshot.read().exact_count(&range) {
            Some(total)
        } else {
            let count = core::count_keys(client, &query.prefix, Some(revision))
                .await
                .map_err(|e| e.to_string())?;
            snapshot.write().set_exact_count(range.clone(), count.total);
            Some(count.total)
        };

        return Ok(ResolvedSnapshot {
            range,
            revision,
            known_total: started_total,
            snapshot,
        });
    }

    let count = core::count_keys(client, &query.prefix, None)
        .await
        .map_err(|e| e.to_string())?;
    let snapshot = state.lock().await.get_or_create_snapshot(SnapshotKey {
        profile_fingerprint: profile_fingerprint.to_string(),
        revision: count.revision,
    });
    snapshot.write().set_exact_count(range.clone(), count.total);

    Ok(ResolvedSnapshot {
        range,
        revision: count.revision,
        known_total: if has_search { None } else { Some(count.total) },
        snapshot,
    })
}

async fn ensure_required_prefix_keys(
    snapshot: &SharedSnapshot,
    range: &KeyRange,
    required_keys: usize,
    client: &mut etcd_client::Client,
    revision: i64,
    cancelled: &Arc<AtomicBool>,
) -> Result<(), String> {
    loop {
        check_cancelled(cancelled)?;

        let (covered_end, covered_count, fully_covered): (Vec<u8>, usize, bool) = {
            let store = snapshot.read();
            let covered_end = store.covered_prefix_end(range);
            let covered_range = KeyRange::new(range.start.clone(), covered_end.clone());
            (
                covered_end,
                store.key_count_in_range(&covered_range),
                store.is_range_covered(range),
            )
        };

        if covered_count >= required_keys || fully_covered {
            return Ok(());
        }

        let batch = core::list_keys(
            client,
            &covered_end,
            &range.end,
            SNAPSHOT_FETCH_CHUNK_SIZE,
            Some(revision),
        )
        .await?;

        if batch.keys.is_empty() {
            snapshot
                .write()
                .mark_range_covered(KeyRange::new(covered_end.clone(), range.end.clone()));
            return Ok(());
        }

        let mut next_end = if batch.more {
            key_after(batch.keys.last().expect("batch should contain a key"))
        } else {
            range.end.clone()
        };
        if next_end > range.end {
            next_end = range.end.clone();
        }

        let mut store = snapshot.write();
        store.insert_keys(batch.keys);
        store.mark_range_covered(KeyRange::new(covered_end.clone(), next_end));
    }
}

async fn load_page_items(
    snapshot: &SharedSnapshot,
    client: &mut etcd_client::Client,
    page_keys: &[Vec<u8>],
    revision: i64,
) -> Result<Vec<client::KvEntry>, String> {
    let missing_keys: Vec<Vec<u8>> = {
        let store = snapshot.read();
        store.missing_value_keys(page_keys)
    };

    if !missing_keys.is_empty() {
        let fetched = core::get_values(client, &missing_keys, Some(revision)).await?;
        snapshot.write().upsert_items(fetched);
    }

    Ok(snapshot.read().cached_items_for_keys(page_keys))
}

async fn run_lazy_search(
    on_event: &Channel<QueryEvent>,
    snapshot: &SharedSnapshot,
    range: &KeyRange,
    revision: i64,
    cancelled: &Arc<AtomicBool>,
    search: &str,
    current_page: i64,
    page_size: i64,
    scan_client: &mut etcd_client::Client,
    value_client: &mut etcd_client::Client,
) -> Result<i64, String> {
    let (page_start, page_end) = page_bounds(current_page, page_size);

    if !snapshot.read().is_range_covered(range) {
        let mut scanned = 0_i64;
        let mut matched = 0_i64;

        core::stream_keys(
            scan_client,
            &range.start,
            &range.end,
            Some(revision),
            |keys| {
                check_cancelled(cancelled)?;
                scanned += keys.len() as i64;
                snapshot.write().insert_keys(keys.clone());

                for key in &keys {
                    if matches_key_bytes(key, search) {
                        matched += 1;
                    }
                }

                send_event(
                    on_event,
                    QueryEvent::Progress {
                        scanned,
                        matched,
                        total: None,
                    },
                )
            },
        )
        .await?;

        snapshot.write().mark_range_covered(range.clone());
    }

    let matching_keys: Vec<_> = snapshot
        .read()
        .keys_in_range(range)
        .into_iter()
        .filter(|key| matches_key_bytes(key, search))
        .collect();

    let total = matching_keys.len() as i64;
    let page_keys: Vec<_> = matching_keys
        .into_iter()
        .skip(page_start)
        .take(page_end - page_start)
        .collect();
    let page_items = load_page_items(snapshot, value_client, &page_keys, revision).await?;

    send_event(on_event, QueryEvent::PageChunk { items: page_items })?;
    Ok(total)
}

async fn run_full_search(
    on_event: &Channel<QueryEvent>,
    snapshot: &SharedSnapshot,
    range: &KeyRange,
    revision: i64,
    cancelled: &Arc<AtomicBool>,
    search: &str,
    current_page: i64,
    page_size: i64,
    client: &mut etcd_client::Client,
) -> Result<i64, String> {
    let (page_start, page_end) = page_bounds(current_page, page_size);

    // Fast path: snapshot already has all data
    {
        let store = snapshot.read();
        if store.is_range_covered(range) && store.has_all_values_for_range(range) {
            let matching: Vec<_> = store
                .items_in_range(range)
                .into_iter()
                .filter(|item| matches_item(item, search, LoadMode::Full))
                .collect();
            let total = matching.len() as i64;
            let page = matching
                .into_iter()
                .skip(page_start)
                .take(page_end - page_start)
                .collect();
            send_event(on_event, QueryEvent::PageChunk { items: page })?;
            return Ok(total);
        }
    }

    let mut scanned = 0_i64;
    let mut matched = 0_i64;
    let mut page_items = Vec::new();
    let mut page_sent = false;

    core::stream_items(client, &range.start, &range.end, Some(revision), |items| {
        check_cancelled(cancelled)?;

        scanned += items.len() as i64;
        snapshot.write().upsert_items(items.clone());

        for item in items {
            if matches_item(&item, search, LoadMode::Full) {
                if (matched as usize) >= page_start && (matched as usize) < page_end {
                    page_items.push(item.clone());
                }
                matched += 1;
            }
        }

        send_event(
            on_event,
            QueryEvent::Progress {
                scanned,
                matched,
                total: None,
            },
        )?;

        if !page_sent && page_items.len() == page_size as usize {
            send_event(
                on_event,
                QueryEvent::PageChunk {
                    items: page_items.clone(),
                },
            )?;
            page_sent = true;
        }

        Ok(())
    })
    .await?;

    snapshot.write().mark_range_covered(range.clone());

    if !page_sent {
        send_event(on_event, QueryEvent::PageChunk { items: page_items })?;
    }

    Ok(matched)
}

async fn run_dashboard_query(
    state: &State<'_, Mutex<AppState>>,
    profile_fingerprint: &str,
    query: &QueryRequest,
    on_event: &Channel<QueryEvent>,
    cancelled: &Arc<AtomicBool>,
    client: &mut etcd_client::Client,
) -> Result<(), String> {
    let search = query.search.trim().to_string();
    let has_search = !search.is_empty();
    let current_page = query.current_page.max(1);
    let page_size = query.page_size.max(1);
    let (page_start, _) = page_bounds(current_page, page_size);

    let resolved = resolve_snapshot(state, client, profile_fingerprint, query, has_search).await?;

    send_event(
        on_event,
        QueryEvent::Started {
            request_id: query.request_id.clone(),
            mode: query.load_mode,
            resolved_revision: resolved.revision,
            total: resolved.known_total,
            preserve_pagination_state: query.preserve_pagination_state,
        },
    )?;

    let final_total = if has_search {
        match query.load_mode {
            LoadMode::Lazy => {
                // Lazy search needs a second client for value fetching concurrently
                let mut value_client = acquire_client(state).await?;
                run_lazy_search(
                    on_event,
                    &resolved.snapshot,
                    &resolved.range,
                    resolved.revision,
                    cancelled,
                    &search,
                    current_page,
                    page_size,
                    client,
                    &mut value_client,
                )
                .await?
            }
            LoadMode::Full => {
                run_full_search(
                    on_event,
                    &resolved.snapshot,
                    &resolved.range,
                    resolved.revision,
                    cancelled,
                    &search,
                    current_page,
                    page_size,
                    client,
                )
                .await?
            }
        }
    } else {
        let exact_total = resolved.known_total.unwrap_or_default();
        let needed_keys = required_key_count(page_start, page_size, exact_total);

        let can_fast_path = {
            let store = resolved.snapshot.read();
            should_try_first_page_full_fast_path(
                current_page,
                query.load_mode,
                store.key_count_in_range(&resolved.range),
            )
        };

        if can_fast_path && exact_total > 0 {
            let page_items = core::list_items(
                client,
                &resolved.range.start,
                &resolved.range.end,
                page_size,
                Some(resolved.revision),
            )
            .await?;

            if !page_items.is_empty() {
                let next_end = if page_items.len() as i64 >= exact_total {
                    resolved.range.end.clone()
                } else {
                    key_after(
                        page_items
                            .last()
                            .expect("page should contain item")
                            .key
                            .as_bytes(),
                    )
                };

                let mut store = resolved.snapshot.write();
                store.upsert_items(page_items.clone());
                store.mark_range_covered(KeyRange::new(resolved.range.start.clone(), next_end));
                drop(store);

                send_event(on_event, QueryEvent::PageChunk { items: page_items })?;
            } else {
                send_event(on_event, QueryEvent::PageChunk { items: Vec::new() })?;
            }

            exact_total
        } else {
            ensure_required_prefix_keys(
                &resolved.snapshot,
                &resolved.range,
                needed_keys,
                client,
                resolved.revision,
                cancelled,
            )
            .await?;

            let page_keys = resolved.snapshot.read().page_keys(
                &resolved.range,
                page_start,
                page_size as usize,
            );
            let page_items =
                load_page_items(&resolved.snapshot, client, &page_keys, resolved.revision).await?;
            send_event(on_event, QueryEvent::PageChunk { items: page_items })?;
            exact_total
        }
    };

    if is_cancelled(cancelled) {
        send_event(on_event, QueryEvent::Cancelled)?;
        return Ok(());
    }

    send_event(
        on_event,
        QueryEvent::Completed {
            total: final_total,
            page: current_page,
            page_size,
        },
    )
}

#[tauri::command]
pub async fn start_dashboard_query(
    query: QueryRequest,
    on_event: Channel<QueryEvent>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    log::debug!(
        "Starting dashboard query request_id={} prefix={} page={} page_size={} mode={:?}",
        query.request_id,
        query.prefix,
        query.current_page,
        query.page_size,
        query.load_mode,
    );

    let request_id = query.request_id.clone();
    let profile_fingerprint = { state.lock().await.current_profile_fingerprint()? };
    let cancelled = { state.lock().await.register_query(request_id.clone()) };

    let mut client = acquire_client(&state).await?;

    let mut result = run_dashboard_query(
        &state,
        &profile_fingerprint,
        &query,
        &on_event,
        &cancelled,
        &mut client,
    )
    .await;

    if result
        .as_ref()
        .err()
        .is_some_and(|e| crate::client::is_invalid_auth_token_error(e))
        && !is_cancelled(&cancelled)
    {
        log::warn!(
            "Dashboard query {} received invalid auth token, refreshing client and retrying",
            request_id
        );
        client = refresh_client(&state).await?;
        result = run_dashboard_query(
            &state,
            &profile_fingerprint,
            &query,
            &on_event,
            &cancelled,
            &mut client,
        )
        .await;
    }

    state.lock().await.unregister_query(&request_id);

    if let Err(error) = result {
        log::error!("Dashboard query {} failed: {}", request_id, error);
        let message = if crate::client::is_invalid_auth_token_error(&error) {
            "Authentication expired and automatic reconnection failed.".to_string()
        } else {
            error
        };
        let _ = send_event(&on_event, QueryEvent::Error { message });
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_dashboard_query(
    request_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let cancelled = {
        let mut app_state = state.lock().await;
        app_state.cancel_query(&request_id)
    };

    if !cancelled {
        log::debug!(
            "Dashboard query {} was already finished before cancellation",
            request_id
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{LoadMode, page_bounds, required_key_count, should_try_first_page_full_fast_path};

    #[test]
    fn page_bounds_are_one_based() {
        assert_eq!(page_bounds(1, 20), (0, 20));
        assert_eq!(page_bounds(3, 20), (40, 60));
    }

    #[test]
    fn required_key_count_is_clamped_to_total() {
        assert_eq!(required_key_count(40, 20, 45), 45);
        assert_eq!(required_key_count(0, 20, 100), 20);
    }

    #[test]
    fn full_first_page_fast_path_only_applies_to_empty_snapshots() {
        assert!(should_try_first_page_full_fast_path(1, LoadMode::Full, 0));
        assert!(!should_try_first_page_full_fast_path(2, LoadMode::Full, 0));
        assert!(!should_try_first_page_full_fast_path(1, LoadMode::Lazy, 0));
        assert!(!should_try_first_page_full_fast_path(1, LoadMode::Full, 1));
    }
}
