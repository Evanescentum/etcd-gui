use std::collections::LinkedList;
use std::fmt::Debug;

use etcd_client::{Client, GetOptions, SortOrder, SortTarget};

use crate::client::KvEntry;

const STREAM_CHUNK_SIZE: usize = 2048;

struct BatchTask {
    from_key: Vec<u8>,
    limit: i64,
}

/// Trait for types that can be split into batches for etcd range queries
pub trait Splittable {
    type Output;

    /// Create base GetOptions for batch queries
    fn get_options(&self) -> GetOptions {
        GetOptions::new()
    }

    /// Map KeyValue vector to output type
    fn map_kvs(&self, kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output>;
}

pub fn deliver_in_chunks<S, F>(
    splitter: &S,
    kvs: Vec<etcd_client::KeyValue>,
    on_chunk: &mut F,
) -> Result<(), String>
where
    S: Splittable,
    F: FnMut(Vec<S::Output>) -> Result<(), String>,
{
    let mut chunk = Vec::with_capacity(STREAM_CHUNK_SIZE);

    for item in splitter.map_kvs(kvs) {
        chunk.push(item);

        if chunk.len() == STREAM_CHUNK_SIZE {
            on_chunk(chunk)?;
            chunk = Vec::with_capacity(STREAM_CHUNK_SIZE);
        }
    }

    if !chunk.is_empty() {
        on_chunk(chunk)?;
    }

    Ok(())
}

pub async fn stream_range_batched<S, F>(
    client: &mut Client,
    splitter: S,
    range: (impl Into<Vec<u8>>, impl Into<Vec<u8>>),
    sort: (SortTarget, SortOrder),
    revision: Option<i64>,
    mut on_chunk: F,
) -> Result<(), String>
where
    S: Splittable,
    F: FnMut(Vec<S::Output>) -> Result<(), String>,
{
    let (start_key, range_end) = (range.0.into(), range.1.into());
    let (sort_target, sort_order) = sort;

    let count = client
        .get(
            start_key.clone(),
            apply_revision(
                GetOptions::new()
                    .with_serializable()
                    .with_range(range_end.clone())
                    .with_count_only(),
                revision,
            )
            .into(),
        )
        .await
        .map(|res| res.count())
        .map_err(|e| e.to_string())?;
    log::debug!("Total keys: {}", count);

    let mut tasks = LinkedList::new();
    tasks.push_back(BatchTask {
        from_key: start_key,
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
                apply_revision(
                    splitter
                        .get_options()
                        .with_serializable()
                        .with_range(range_end.clone())
                        .with_limit(task.limit)
                        .with_sort(sort_target, sort_order),
                    revision,
                )
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

                let next_from_key = if has_more {
                    Some(
                        kvs.last()
                            .expect("Result should have at least one item")
                            .key()
                            .to_owned(),
                    )
                } else {
                    None
                };

                deliver_in_chunks(&splitter, kvs, &mut on_chunk)?;

                if let Some(last_key) = next_from_key {
                    tasks.push_back(BatchTask {
                        from_key: last_key,
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
                log::error!("Error fetching keys: {}", e);
                return Err(e.to_string());
            }
        }
    }

    Ok(())
}

/// Splitter for list_items (full KV pairs with prefix)
pub struct KvSplitter;

impl Splittable for KvSplitter {
    type Output = KvEntry;

    fn map_kvs(&self, kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|kv| {
            if let (Ok(key_str), Ok(value_str)) = (
                std::str::from_utf8(kv.key()),
                std::str::from_utf8(kv.value()),
            ) {
                Some(KvEntry {
                    key: key_str.to_owned(),
                    value: value_str.to_owned(),
                    version: kv.version(),
                    create_revision: kv.create_revision(),
                    mod_revision: kv.mod_revision(),
                    lease: kv.lease(),
                })
            } else {
                None
            }
        })
    }
}

/// Splitter for list_keys_only (keys only with prefix)
pub struct KeysOnlySplitter;

impl Splittable for KeysOnlySplitter {
    type Output = String;

    fn get_options(&self) -> GetOptions {
        GetOptions::new().with_keys_only()
    }

    fn map_kvs(&self, kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter()
            .map(|kv| kv.into_key_value().0)
            .map(String::from_utf8)
            .filter_map(Result::ok)
    }
}

pub fn is_out_of_range_error<T: Debug>(res: &Result<T, etcd_client::Error>) -> bool {
    matches!(
        res,
        Err(etcd_client::Error::GRpcStatus(status)) if status.code() == tonic::Code::OutOfRange
    )
}

fn apply_revision(options: GetOptions, revision: Option<i64>) -> GetOptions {
    super::apply_revision(options, revision)
}
