use std::collections::VecDeque;
use std::fmt::Debug;

use etcd_client::{GetOptions, SortOrder, SortTarget};

use crate::{
    core::key_after,
    snapshot::{KeyRange, KvEntry},
    state::AppState,
};

/// Converts an etcd `KeyValue` into a [`KvEntry`].
pub fn item_from_kv(kv: etcd_client::KeyValue, only_keys: bool) -> Option<KvEntry> {
    if only_keys {
        if let Ok(key_str) = kv.key_str() {
            Some(KvEntry {
                key: key_str.to_owned(),
                value: None,
                version: kv.version(),
                create_revision: kv.create_revision(),
                mod_revision: kv.mod_revision(),
                lease: kv.lease(),
            })
        } else {
            None
        }
    } else if let (Ok(key_str), Ok(value_str)) = (kv.key_str(), kv.value_str()) {
        Some(KvEntry {
            key: key_str.to_owned(),
            value: Some(value_str.to_owned()),
            version: kv.version(),
            create_revision: kv.create_revision(),
            mod_revision: kv.mod_revision(),
            lease: kv.lease(),
        })
    } else {
        None
    }
}

/// Trait for types that can be split into batches for etcd range queries.
pub trait Splittable {
    type Output;

    /// Create base `GetOptions` for batch queries.
    fn get_options(&self) -> GetOptions {
        GetOptions::new()
    }

    /// Map `KeyValue` vector to output type.
    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output>;
}

struct BatchTask {
    from_key: Vec<u8>,
    limit: i64,
}

/// Executes a splittable range query, automatically splitting into smaller batches
/// if out-of-range errors are encountered.
pub async fn execute_splittable<S: Splittable + Clone>(
    state: &mut AppState,
    splitter: S,
    range: KeyRange,
    sort: (SortTarget, SortOrder),
    revision: i64,
) -> Result<Vec<S::Output>, String> {
    state
        .perform_op(async |mut client: etcd_client::Client| {
            let full_res = client
                .get(
                    range.start.clone(),
                    splitter
                        .get_options()
                        .with_serializable()
                        .with_range(range.end.clone())
                        .with_sort(sort.0, sort.1)
                        .with_revision(revision)
                        .into(),
                )
                .await;

            match full_res {
                Ok(mut res) => {
                    let kvs = res.take_kvs();
                    log::debug!("Fetched {} keys in full-range query", kvs.len());
                    return Ok(S::map_kvs(kvs).collect());
                }
                e if is_out_of_range_error(&e) => {
                    log::info!("Full-range query is out of range, falling back to split batches");
                }
                Err(e) => {
                    log::error!("Error fetching keys: {e}");
                    return Err(e);
                }
            }

            let count = client
                .get(
                    range.start.clone(),
                    GetOptions::new()
                        .with_serializable()
                        .with_range(range.end.clone())
                        .with_count_only()
                        .with_revision(revision)
                        .into(),
                )
                .await
                .map(|res| res.count())?;
            log::debug!("Total keys: {count}");

            let mut results = Vec::with_capacity(count as usize);
            let mut tasks = VecDeque::new();
            tasks.push_back(BatchTask {
                from_key: range.start.clone(),
                limit: (count / 2).max(1),
            });

            while let Some(task) = tasks.pop_back() {
                log::debug!(
                    "Fetching batch starting at '{}' with limit {}",
                    String::from_utf8_lossy(&task.from_key),
                    task.limit
                );
                let res = client
                    .get(
                        task.from_key.clone(),
                        splitter
                            .get_options()
                            .with_serializable()
                            .with_range(range.end.clone())
                            .with_limit(task.limit)
                            .with_sort(sort.0, sort.1)
                            .with_revision(revision)
                            .into(),
                    )
                    .await;

                match res {
                    Ok(mut res) => {
                        let has_more = res.more();
                        let kvs = res.take_kvs();
                        log::debug!(
                            "Fetched {} keys in batch starting at '{}'",
                            kvs.len(),
                            String::from_utf8_lossy(&task.from_key)
                        );

                        if kvs.is_empty() {
                            continue;
                        }

                        let last_key = has_more.then(|| {
                            kvs.last()
                                .expect("Result should have at least one item")
                                .key()
                                .to_owned()
                        });

                        results.extend(S::map_kvs(kvs));

                        if let Some(last_key) = last_key {
                            tasks.push_back(BatchTask {
                                from_key: key_after(&last_key),
                                limit: task.limit * 2,
                            });
                        }
                    }
                    e if is_out_of_range_error(&e) => {
                        log::info!(
                            "Batch starting at '{}' with limit {} is out of range, splitting...",
                            String::from_utf8_lossy(&task.from_key),
                            task.limit
                        );
                        if task.limit <= 1 {
                            log::error!(
                                "Batch size reduced to 1 but still out of range, skipping key '{}'",
                                String::from_utf8_lossy(&task.from_key)
                            );
                            continue;
                        }
                        tasks.push_back(BatchTask {
                            from_key: task.from_key,
                            limit: task.limit / 2,
                        });
                    }
                    Err(e) => {
                        log::error!("Error fetching keys: {e}");
                        return Err(e);
                    }
                }
            }

            Ok(results)
        })
        .await
}

/// Splitter for full KV pairs (key + value).
#[derive(Clone, Copy)]
pub struct KvSplitter;

impl Splittable for KvSplitter {
    type Output = KvEntry;

    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|x| item_from_kv(x, false))
    }
}

/// Splitter for keys-only (no values).
#[derive(Clone, Copy)]
pub struct KeysOnlySplitter;

impl Splittable for KeysOnlySplitter {
    type Output = KvEntry;

    fn get_options(&self) -> GetOptions {
        GetOptions::new().with_keys_only()
    }

    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|x| item_from_kv(x, true))
    }
}

pub fn is_out_of_range_error<T: Debug>(res: &Result<T, etcd_client::Error>) -> bool {
    matches!(
        res,
        Err(etcd_client::Error::GRpcStatus(status)) if status.code() == tonic::Code::OutOfRange
    )
}
