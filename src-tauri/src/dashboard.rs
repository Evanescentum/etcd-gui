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

const DASHBOARD_CANCELLED: &str = "__dashboard_cancelled__";
const SNAPSHOT_FETCH_CHUNK_SIZE: i64 = 2048;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum DashboardQueryLoadMode {
    Full,
    Lazy,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardQueryRequest {
    pub request_id: String,
    pub prefix: String,
    pub search: String,
    pub current_page: i64,
    pub page_size: i64,
    pub load_mode: DashboardQueryLoadMode,
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
pub enum DashboardQueryEvent {
    Started {
        request_id: String,
        mode: DashboardQueryLoadMode,
        resolved_revision: i64,
        total: Option<i64>,
        preserve_pagination_state: bool,
    },
    PageChunk {
        items: Vec<client::Item>,
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

struct DashboardQueryClients {
    count: etcd_client::Client,
    scan: etcd_client::Client,
    value: etcd_client::Client,
}

struct ResolvedDashboardSnapshot {
    range: KeyRange,
    revision: i64,
    started_total: Option<i64>,
    snapshot: SharedSnapshot,
}

struct DashboardSearchRuntime<'a> {
    on_event: &'a Channel<DashboardQueryEvent>,
    resolved_snapshot: &'a ResolvedDashboardSnapshot,
    cancelled: &'a Arc<AtomicBool>,
}

impl DashboardSearchRuntime<'_> {
    fn snapshot(&self) -> &SharedSnapshot {
        &self.resolved_snapshot.snapshot
    }

    fn range(&self) -> &KeyRange {
        &self.resolved_snapshot.range
    }

    fn revision(&self) -> i64 {
        self.resolved_snapshot.revision
    }
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
    load_mode: DashboardQueryLoadMode,
    snapshot_key_count: usize,
) -> bool {
    current_page == 1 && load_mode == DashboardQueryLoadMode::Full && snapshot_key_count == 0
}

async fn acquire_dashboard_query_clients(
    state: &State<'_, Mutex<AppState>>,
) -> Result<DashboardQueryClients, String> {
    let mut app_state = state.lock().await;
    let client = app_state.get_client().await?.clone();

    Ok(DashboardQueryClients {
        count: client.clone(),
        scan: client.clone(),
        value: client,
    })
}

async fn refresh_dashboard_query_clients(
    state: &State<'_, Mutex<AppState>>,
) -> Result<DashboardQueryClients, String> {
    let mut app_state = state.lock().await;
    app_state.etcd_client = None;
    let client = app_state.get_client().await?.clone();

    Ok(DashboardQueryClients {
        count: client.clone(),
        scan: client.clone(),
        value: client,
    })
}

fn is_query_cancelled(cancelled: &Arc<AtomicBool>) -> bool {
    cancelled.load(Ordering::Relaxed)
}

fn send_dashboard_event(
    on_event: &Channel<DashboardQueryEvent>,
    event: DashboardQueryEvent,
) -> Result<(), String> {
    on_event.send(event).map_err(|error| error.to_string())
}

fn dashboard_matches_item(
    item: &client::Item,
    search: &str,
    load_mode: DashboardQueryLoadMode,
) -> bool {
    if search.is_empty() {
        return true;
    }

    item.key.contains(search)
        || (load_mode == DashboardQueryLoadMode::Full && item.value.contains(search))
}

fn dashboard_matches_key_bytes(key: &[u8], search: &str) -> bool {
    search.is_empty() || String::from_utf8_lossy(key).contains(search)
}

fn read_snapshot<T>(snapshot: &SharedSnapshot, f: impl FnOnce(&crate::snapshot::SnapshotStore) -> T) -> T {
    let store = snapshot.read().expect("snapshot lock poisoned");
    f(&store)
}

fn write_snapshot<T>(
    snapshot: &SharedSnapshot,
    f: impl FnOnce(&mut crate::snapshot::SnapshotStore) -> T,
) -> T {
    let mut store = snapshot.write().expect("snapshot lock poisoned");
    f(&mut store)
}

async fn current_profile_fingerprint(state: &State<'_, Mutex<AppState>>) -> Result<String, String> {
    let app_state = state.lock().await;
    app_state.current_profile_fingerprint()
}

async fn get_or_create_snapshot(
    state: &State<'_, Mutex<AppState>>,
    profile_fingerprint: &str,
    revision: i64,
) -> SharedSnapshot {
    let mut app_state = state.lock().await;
    app_state.get_or_create_snapshot(SnapshotKey {
        profile_fingerprint: profile_fingerprint.to_string(),
        revision,
    })
}

async fn resolve_dashboard_snapshot(
    state: &State<'_, Mutex<AppState>>,
    count_client: &mut etcd_client::Client,
    profile_fingerprint: &str,
    query: &DashboardQueryRequest,
    has_search: bool,
) -> Result<ResolvedDashboardSnapshot, String> {
    let range = KeyRange::from_prefix(&query.prefix);

    if let Some(revision) = query.revision {
        let snapshot = get_or_create_snapshot(state, profile_fingerprint, revision).await;
        let started_total = if has_search {
            None
        } else if let Some(total) = read_snapshot(&snapshot, |store| store.exact_count(&range)) {
            Some(total)
        } else {
            let count = core::count_items_with_client(count_client, &query.prefix, Some(revision))
                .await
                .map_err(|error| error.to_string())?;
            write_snapshot(&snapshot, |store| store.set_exact_count(range.clone(), count.total));
            Some(count.total)
        };

        return Ok(ResolvedDashboardSnapshot {
            range,
            revision,
            started_total,
            snapshot,
        });
    }

    let count = core::count_items_with_client(count_client, &query.prefix, None)
        .await
        .map_err(|error| error.to_string())?;
    let snapshot = get_or_create_snapshot(state, profile_fingerprint, count.revision).await;
    write_snapshot(&snapshot, |store| store.set_exact_count(range.clone(), count.total));

    Ok(ResolvedDashboardSnapshot {
        range,
        revision: count.revision,
        started_total: if has_search { None } else { Some(count.total) },
        snapshot,
    })
}

async fn ensure_required_prefix_keys(
    snapshot: &SharedSnapshot,
    range: &KeyRange,
    required_keys: usize,
    scan_client: &mut etcd_client::Client,
    revision: i64,
    cancelled: &Arc<AtomicBool>,
) -> Result<(), String> {
    loop {
        if is_query_cancelled(cancelled) {
            return Err(DASHBOARD_CANCELLED.to_string());
        }

        let (covered_end, covered_count, fully_covered) = read_snapshot(snapshot, |store| {
            let covered_end = store.covered_prefix_end(range);
            let covered_range = KeyRange::new(range.start.clone(), covered_end.clone());
            (
                covered_end,
                store.key_count_in_range(&covered_range),
                store.is_range_covered(range),
            )
        });

        if covered_count >= required_keys || fully_covered {
            return Ok(());
        }

        let batch = core::list_keys_in_range_limited_with_client(
            scan_client,
            &covered_end,
            &range.end,
            SNAPSHOT_FETCH_CHUNK_SIZE,
            Some(revision),
        )
        .await?;

        if batch.keys.is_empty() {
            write_snapshot(snapshot, |store| {
                store.mark_range_covered(KeyRange::new(covered_end.clone(), range.end.clone()));
            });
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

        write_snapshot(snapshot, |store| {
            store.insert_keys(batch.keys);
            store.mark_range_covered(KeyRange::new(covered_end.clone(), next_end));
        });
    }
}

async fn load_page_items_from_snapshot(
    snapshot: &SharedSnapshot,
    value_client: &mut etcd_client::Client,
    page_keys: &[Vec<u8>],
    revision: i64,
) -> Result<Vec<client::Item>, String> {
    let missing_keys = read_snapshot(snapshot, |store| store.missing_value_keys(page_keys));

    if !missing_keys.is_empty() {
        let fetched_items =
            core::get_values_for_keys_with_client(value_client, &missing_keys, Some(revision)).await?;
        write_snapshot(snapshot, |store| store.upsert_items(fetched_items));
    }

    Ok(read_snapshot(snapshot, |store| store.cached_items_for_keys(page_keys)))
}

async fn run_lazy_search_query(
    runtime: &DashboardSearchRuntime<'_>,
    search: &str,
    current_page: i64,
    page_size: i64,
    scan_client: &mut etcd_client::Client,
    value_client: &mut etcd_client::Client,
) -> Result<i64, String> {
    let (page_start, page_end) = page_bounds(current_page, page_size);

    if !read_snapshot(runtime.snapshot(), |store| store.is_range_covered(runtime.range())) {
        let mut scanned = 0_i64;
        let mut matched = 0_i64;

        core::stream_all_keys_in_range_with_client(
            scan_client,
            runtime.range(),
            runtime.revision(),
            |keys| {
                if is_query_cancelled(runtime.cancelled) {
                    return Err(DASHBOARD_CANCELLED.to_string());
                }

                scanned += keys.len() as i64;
                write_snapshot(runtime.snapshot(), |store| store.insert_keys(keys.clone()));

                for key in keys {
                    if dashboard_matches_key_bytes(&key, search) {
                        matched += 1;
                    }
                }

                send_dashboard_event(
                    runtime.on_event,
                    DashboardQueryEvent::Progress {
                        scanned,
                        matched,
                        total: None,
                    },
                )
            },
        )
        .await?;

        write_snapshot(runtime.snapshot(), |store| {
            store.mark_range_covered(runtime.range().clone())
        });
    }

    let matching_keys = read_snapshot(runtime.snapshot(), |store| {
        store
            .keys_in_range(runtime.range())
            .into_iter()
            .filter(|key| dashboard_matches_key_bytes(key, search))
            .collect::<Vec<_>>()
    });
    let total = matching_keys.len() as i64;
    let page_keys = matching_keys
        .into_iter()
        .skip(page_start)
        .take(page_end - page_start)
        .collect::<Vec<_>>();
    let page_items =
        load_page_items_from_snapshot(runtime.snapshot(), value_client, &page_keys, runtime.revision())
            .await?;

    send_dashboard_event(runtime.on_event, DashboardQueryEvent::PageChunk { items: page_items })?;
    Ok(total)
}

async fn run_full_search_query(
    runtime: &DashboardSearchRuntime<'_>,
    search: &str,
    current_page: i64,
    page_size: i64,
    scan_client: &mut etcd_client::Client,
) -> Result<i64, String> {
    let (page_start, page_end) = page_bounds(current_page, page_size);

    if read_snapshot(runtime.snapshot(), |store| {
        store.is_range_covered(runtime.range()) && store.has_all_values_for_range(runtime.range())
    }) {
        let matching_items = read_snapshot(runtime.snapshot(), |store| {
            store
                .items_in_range(runtime.range())
                .into_iter()
                .filter(|item| dashboard_matches_item(item, search, DashboardQueryLoadMode::Full))
                .collect::<Vec<_>>()
        });

        let total = matching_items.len() as i64;
        let page_items = matching_items
            .into_iter()
            .skip(page_start)
            .take(page_end - page_start)
            .collect();
        send_dashboard_event(runtime.on_event, DashboardQueryEvent::PageChunk { items: page_items })?;
        return Ok(total);
    }

    let mut scanned = 0_i64;
    let mut matched = 0_i64;
    let mut page_items = Vec::new();
    let mut page_sent = false;

    core::stream_all_items_in_range_with_client(
        scan_client,
        runtime.range(),
        runtime.revision(),
        |items| {
            if is_query_cancelled(runtime.cancelled) {
                return Err(DASHBOARD_CANCELLED.to_string());
            }

            scanned += items.len() as i64;
            write_snapshot(runtime.snapshot(), |store| store.upsert_items(items.clone()));

            for item in items {
                if dashboard_matches_item(&item, search, DashboardQueryLoadMode::Full) {
                    if (matched as usize) >= page_start && (matched as usize) < page_end {
                        page_items.push(item.clone());
                    }
                    matched += 1;
                }
            }

            send_dashboard_event(
                runtime.on_event,
                DashboardQueryEvent::Progress {
                    scanned,
                    matched,
                    total: None,
                },
            )?;

            if !page_sent && page_items.len() == page_size as usize {
                send_dashboard_event(
                    runtime.on_event,
                    DashboardQueryEvent::PageChunk {
                        items: page_items.clone(),
                    },
                )?;
                page_sent = true;
            }

            Ok(())
        },
    )
    .await?;

    write_snapshot(runtime.snapshot(), |store| {
        store.mark_range_covered(runtime.range().clone())
    });

    if !page_sent {
        send_dashboard_event(
            runtime.on_event,
            DashboardQueryEvent::PageChunk {
                items: page_items.clone(),
            },
        )?;
    }

    Ok(matched)
}

async fn run_dashboard_query(
    state: &State<'_, Mutex<AppState>>,
    profile_fingerprint: &str,
    query: DashboardQueryRequest,
    on_event: Channel<DashboardQueryEvent>,
    cancelled: Arc<AtomicBool>,
    mut clients: DashboardQueryClients,
) -> Result<(), String> {
    let search = query.search.trim().to_string();
    let has_search = !search.is_empty();
    let current_page = query.current_page.max(1);
    let page_size = query.page_size.max(1);
    let (page_start, _) = page_bounds(current_page, page_size);
    let resolved_snapshot = resolve_dashboard_snapshot(
        state,
        &mut clients.count,
        profile_fingerprint,
        &query,
        has_search,
    )
    .await?;

    send_dashboard_event(
        &on_event,
        DashboardQueryEvent::Started {
            request_id: query.request_id.clone(),
            mode: query.load_mode,
            resolved_revision: resolved_snapshot.revision,
            total: resolved_snapshot.started_total,
            preserve_pagination_state: query.preserve_pagination_state,
        },
    )?;

    let final_total = if has_search {
        let runtime = DashboardSearchRuntime {
            on_event: &on_event,
            resolved_snapshot: &resolved_snapshot,
            cancelled: &cancelled,
        };

        match query.load_mode {
            DashboardQueryLoadMode::Lazy => {
                run_lazy_search_query(
                    &runtime,
                    &search,
                    current_page,
                    page_size,
                    &mut clients.scan,
                    &mut clients.value,
                )
                .await?
            }
            DashboardQueryLoadMode::Full => {
                run_full_search_query(
                    &runtime,
                    &search,
                    current_page,
                    page_size,
                    &mut clients.scan,
                )
                .await?
            }
        }
    } else {
        let exact_total = resolved_snapshot.started_total.unwrap_or_default();
        let needed_keys = required_key_count(page_start, page_size, exact_total);

        let can_fast_path = read_snapshot(&resolved_snapshot.snapshot, |store| {
            should_try_first_page_full_fast_path(
                current_page,
                query.load_mode,
                store.key_count_in_range(&resolved_snapshot.range),
            )
        });

        if can_fast_path && exact_total > 0 {
            let page_items = core::list_items_in_range_limited_with_client(
                &mut clients.scan,
                &resolved_snapshot.range.start,
                &resolved_snapshot.range.end,
                page_size,
                Some(resolved_snapshot.revision),
            )
            .await?;

            if !page_items.is_empty() {
                let next_end = if page_items.len() as i64 >= exact_total {
                    resolved_snapshot.range.end.clone()
                } else {
                    key_after(page_items.last().expect("page should contain item").key.as_bytes())
                };

                write_snapshot(&resolved_snapshot.snapshot, |store| {
                    store.upsert_items(page_items.clone());
                    store.mark_range_covered(KeyRange::new(
                        resolved_snapshot.range.start.clone(),
                        next_end,
                    ));
                });

                send_dashboard_event(
                    &on_event,
                    DashboardQueryEvent::PageChunk { items: page_items },
                )?;
            } else {
                send_dashboard_event(&on_event, DashboardQueryEvent::PageChunk { items: Vec::new() })?;
            }

            exact_total
        } else {
            ensure_required_prefix_keys(
                &resolved_snapshot.snapshot,
                &resolved_snapshot.range,
                needed_keys,
                &mut clients.scan,
                resolved_snapshot.revision,
                &cancelled,
            )
            .await?;

            let page_keys = read_snapshot(&resolved_snapshot.snapshot, |store| {
                store.page_keys(&resolved_snapshot.range, page_start, page_size as usize)
            });
            let page_items = load_page_items_from_snapshot(
                &resolved_snapshot.snapshot,
                &mut clients.value,
                &page_keys,
                resolved_snapshot.revision,
            )
            .await?;
            send_dashboard_event(&on_event, DashboardQueryEvent::PageChunk { items: page_items })?;
            exact_total
        }
    };

    if is_query_cancelled(&cancelled) {
        send_dashboard_event(&on_event, DashboardQueryEvent::Cancelled)?;
        return Ok(());
    }

    send_dashboard_event(
        &on_event,
        DashboardQueryEvent::Completed {
            total: final_total,
            page: current_page,
            page_size,
        },
    )
}

#[tauri::command]
pub async fn start_dashboard_query(
    query: DashboardQueryRequest,
    on_event: Channel<DashboardQueryEvent>,
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
    let profile_fingerprint = current_profile_fingerprint(&state).await?;
    let cancelled = {
        let mut app_state = state.lock().await;
        app_state.start_query_session(request_id.clone())
    };

    let clients = acquire_dashboard_query_clients(&state).await?;

    let mut result = run_dashboard_query(
        &state,
        &profile_fingerprint,
        query.clone(),
        on_event.clone(),
        cancelled.clone(),
        clients,
    )
    .await;

    if result
        .as_ref()
        .err()
        .is_some_and(|error| crate::client::is_invalid_auth_token_error(error))
        && !is_query_cancelled(&cancelled)
    {
        log::warn!(
            "Dashboard query {} received invalid auth token, refreshing client and retrying",
            request_id
        );

        let clients = refresh_dashboard_query_clients(&state).await?;
        result = run_dashboard_query(
            &state,
            &profile_fingerprint,
            query,
            on_event.clone(),
            cancelled.clone(),
            clients,
        )
        .await;
    }

    {
        let mut app_state = state.lock().await;
        app_state.finish_query_session(&request_id);
    }

    if let Err(error) = result {
        log::error!("Dashboard query {} failed: {}", request_id, error);
        let message = if crate::client::is_invalid_auth_token_error(&error) {
            "Authentication expired and automatic reconnection failed.".to_string()
        } else {
            error
        };
        let _ = send_dashboard_event(&on_event, DashboardQueryEvent::Error { message });
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
        app_state.cancel_query_session(&request_id)
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
    use super::{DashboardQueryLoadMode, page_bounds, required_key_count, should_try_first_page_full_fast_path};

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
        assert!(should_try_first_page_full_fast_path(1, DashboardQueryLoadMode::Full, 0));
        assert!(!should_try_first_page_full_fast_path(2, DashboardQueryLoadMode::Full, 0));
        assert!(!should_try_first_page_full_fast_path(1, DashboardQueryLoadMode::Lazy, 0));
        assert!(!should_try_first_page_full_fast_path(1, DashboardQueryLoadMode::Full, 1));
    }
}