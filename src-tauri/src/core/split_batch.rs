use std::collections::LinkedList;
use std::fmt::Debug;

use etcd_client::{Client, Error, GetOptions, SortOrder, SortTarget};

use crate::client::Item;

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

/// Execute a splittable query with OutOfRange retry logic
pub async fn execute_splittable<S: Splittable>(
    client: &mut Client,
    splitter: S,
    range: (impl Into<Vec<u8>>, impl Into<Vec<u8>>),
    sort: (SortTarget, SortOrder),
) -> Result<Vec<S::Output>, Error> {
    let (start_key, range_end) = (range.0.into(), range.1.into());
    let (sort_target, sort_order) = sort;

    let count = client
        .get(
            start_key.clone(),
            GetOptions::new()
                .with_serializable()
                .with_range(range_end.clone())
                .with_count_only()
                .into(),
        )
        .await
        .map(|res| res.count())?;
    log::debug!("Total keys: {}", count);

    let mut results = Vec::new();
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
                splitter
                    .get_options()
                    .with_serializable()
                    .with_range(range_end.clone())
                    .with_limit(task.limit)
                    .with_sort(sort_target, sort_order)
                    .into(),
            )
            .await;
        match res {
            Ok(mut res) => {
                let kvs = res.take_kvs();
                log::debug!(
                    "Fetched {} keys in batch starting at '{}'",
                    kvs.len(),
                    String::from_utf8_lossy(&task.from_key)
                );
                if kvs.is_empty() {
                    continue;
                }
                if res.more() {
                    let last_key = kvs
                        .last()
                        .expect("Result should have at least one item")
                        .key()
                        .to_owned();
                    tasks.push_back(BatchTask {
                        from_key: last_key,
                        limit: task.limit * 2,
                    });
                }
                results.extend(splitter.map_kvs(kvs));
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
                return Err(e);
            }
        }
    }
    log::debug!("Successfully fetched {} items", results.len());
    Ok(results)
}

/// Splitter for list_items (full KV pairs with prefix)
pub struct KvSplitter;

impl Splittable for KvSplitter {
    type Output = Item;

    fn map_kvs(&self, kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|kv| {
            if let (Ok(key_str), Ok(value_str)) = (
                std::str::from_utf8(kv.key()),
                std::str::from_utf8(kv.value()),
            ) {
                Some(Item {
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

/// Splitter for get_values_in_range (full KV pairs in range)
pub struct ValuesInRangeSplitter;

impl Splittable for ValuesInRangeSplitter {
    type Output = Item;

    fn map_kvs(&self, kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|kv| {
            match (
                std::str::from_utf8(kv.key()),
                std::str::from_utf8(kv.value()),
            ) {
                (Ok(key_str), Ok(value_str)) => Some(Item {
                    key: key_str.to_owned(),
                    value: value_str.to_owned(),
                    version: kv.version(),
                    create_revision: kv.create_revision(),
                    mod_revision: kv.mod_revision(),
                    lease: kv.lease(),
                }),
                _ => None,
            }
        })
    }
}

pub fn is_out_of_range_error<T: Debug>(res: &Result<T, etcd_client::Error>) -> bool {
    matches!(
        res,
        Err(etcd_client::Error::GRpcStatus(status)) if status.code() == tonic::Code::OutOfRange
    )
}
