use std::collections::LinkedList;
use std::fmt::Debug;

use etcd_client::{Client, Error, GetOptions};

use crate::client::{Item, should_refresh};
use crate::state::AppState;

struct BatchTask {
    from_key: Vec<u8>,
    limit: i64,
}

async fn perform_op<T, F, Fut>(state: &mut AppState, f: F) -> Result<T, String>
where
    F: Fn(Client) -> Fut,
    Fut: std::future::Future<Output = Result<T, Error>>,
{
    let client = state.get_client().await?.clone();
    let res = f(client).await;

    if should_refresh(&res) {
        log::warn!("Refreshing client connection...");
        state.etcd_client = None;
        let client = state.get_client().await?.clone();
        f(client).await.map_err(|e| e.to_string())
    } else {
        res.map_err(|e| e.to_string())
    }
}

/// Fetch all keys with the specified prefix
pub async fn list_items(prefix: &str, state: &mut AppState) -> Result<Vec<Item>, String> {
    perform_op(state, |mut client| async move {
        let range_end = range_end_of_prefix(prefix.as_bytes());
        let (sort_target, sort_order) =
            (etcd_client::SortTarget::Key, etcd_client::SortOrder::Ascend);
        let opt = GetOptions::new()
            .with_serializable()
            .with_range(range_end.clone())
            .with_sort(sort_target, sort_order);
        let res = client.get(prefix, Some(opt)).await;
        if !is_out_of_range_error(&res) {
            return res.map(|mut response| {
                response
                    .take_kvs()
                    .into_iter()
                    .filter_map(|kv| {
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
                    .collect()
            });
        }

        log::warn!("Received out-of-range error, retrying...");
        // First we need to get the total count involved
        let count = client
            .get(
                prefix,
                GetOptions::new()
                    .with_serializable()
                    .with_prefix()
                    .with_count_only()
                    .into(),
            )
            .await
            .map(|res| res.count())?;
        log::info!("Total keys with prefix '{}': {}", prefix, count);

        let mut results = Vec::new();
        let mut tasks = LinkedList::new();
        tasks.push_back(BatchTask {
            from_key: prefix.as_bytes().to_vec(),
            limit: (count / 2).max(1),
        });

        // Process the next batch task in LIFO order to retain order
        while let Some(task) = tasks.pop_back() {
            log::debug!(
                "Fetching batch starting at '{}' with limit {}",
                String::from_utf8_lossy(&task.from_key),
                task.limit
            );
            let res = client
                .get(
                    task.from_key.clone(),
                    GetOptions::new()
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
                    // Convert response to Items
                    let items: Vec<Item> = kvs
                        .into_iter()
                        .filter_map(|kv| {
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
                        .collect();
                    results.extend(items);

                    if res.more() {
                        // There are more keys to fetch, add a new task starting from the last key
                        let last_key = &results
                            .last()
                            .expect("Result should have at least one item")
                            .key;
                        tasks.push_back(BatchTask {
                            from_key: make_exclusive_end_from_inclusive(last_key),
                            limit: task.limit * 2, // Try doubling the batch size for the next attempt
                        });
                    }
                }
                e if is_out_of_range_error(&e) => {
                    // Still out of range, need to split further
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
        log::info!(
            "Successfully fetched {} items with prefix '{}'",
            results.len(),
            prefix
        );
        Ok(results)
    })
    .await
}

fn range_end_of_prefix(prefix_key: &[u8]) -> Vec<u8> {
    for (i, v) in prefix_key.iter().enumerate().rev() {
        if *v < 0xFF {
            let mut end = Vec::from(&prefix_key[..=i]);
            end[i] = *v + 1;
            return end;
        }
    }

    // next prefix does not exist (e.g., 0xffff);
    vec![0]
}

/// Fetch only keys with the specified prefix
pub async fn list_keys_only(prefix: &str, state: &mut AppState) -> Result<Vec<String>, String> {
    perform_op(state, |mut client| async move {
        let range_end = range_end_of_prefix(prefix.as_bytes());
        let (sort_target, sort_order) =
            (etcd_client::SortTarget::Key, etcd_client::SortOrder::Ascend);
        let opt = GetOptions::new()
            .with_serializable()
            .with_range(range_end.clone())
            .with_keys_only()
            .with_sort(sort_target, sort_order);
        let res = client.get(prefix, Some(opt)).await;
        if !is_out_of_range_error(&res) {
            return res.map(|mut response| {
                response
                    .take_kvs()
                    .iter()
                    .filter_map(|kv| std::str::from_utf8(kv.key()).ok().map(str::to_owned))
                    .collect()
            });
        }
        log::warn!("Received out-of-range error, retrying...");
        // First we need to get the total count involved
        let count = client
            .get(
                prefix,
                Some(
                    GetOptions::new()
                        .with_serializable()
                        .with_prefix()
                        .with_count_only(),
                ),
            )
            .await
            .map(|res| res.count())?;
        log::info!("Total keys with prefix '{}': {}", prefix, count);

        let mut results = Vec::new();
        let mut tasks = LinkedList::new();
        tasks.push_back(BatchTask {
            from_key: prefix.as_bytes().to_vec(),
            limit: (count / 2).max(1),
        });

        // Process the next batch task in LIFO order to retain order
        while let Some(task) = tasks.pop_back() {
            log::debug!(
                "Fetching batch starting at '{}' with limit {}",
                String::from_utf8_lossy(&task.from_key),
                task.limit
            );
            let res = client
                .get(
                    task.from_key.clone(),
                    GetOptions::new()
                        .with_serializable()
                        .with_range(range_end.clone())
                        .with_keys_only()
                        .with_limit(task.limit)
                        .with_sort(sort_target, sort_order)
                        .into(),
                )
                .await;
            match res {
                Ok(mut res) => {
                    let kvs = res.take_kvs();
                    if kvs.is_empty() {
                        continue;
                    }
                    // Convert response to keys strings and make sure `results` is not empty
                    let kvs = kvs
                        .into_iter()
                        .map(|kv| kv.into_key_value().0)
                        .map(String::from_utf8)
                        .collect::<Result<Vec<_>, _>>()
                        .inspect_err(|e| log::error!("UTF-8 error converting key: {}", e))
                        .map_err(|e| etcd_client::Error::Utf8Error(e.utf8_error()))?;
                    results.extend(kvs);

                    if res.more() {
                        // There are more keys to fetch, add a new task starting from the last key
                        let last_key = results
                            .last()
                            .expect("Result should have at least one item");
                        tasks.push_back(BatchTask {
                            from_key: make_exclusive_end_from_inclusive(last_key),
                            limit: task.limit * 2, // Try doubling the batch size for the next attempt
                        });
                    }
                }
                e if is_out_of_range_error(&e) => {
                    // Still out of range, need to split further
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
        log::info!(
            "Successfully fetched {} keys with prefix '{}'",
            results.len(),
            prefix
        );
        Ok(results)
    })
    .await
}

fn is_out_of_range_error<T: Debug>(res: &Result<T, etcd_client::Error>) -> bool {
    matches!(
        res,
        Err(etcd_client::Error::GRpcStatus(status)) if status.code() == tonic::Code::OutOfRange
    )
}

fn make_exclusive_end_from_inclusive(end_inclusive: &str) -> Vec<u8> {
    // Append a NUL byte to create an exclusive end that includes the original last key
    let mut end = end_inclusive.as_bytes().to_vec();
    end.push(0);
    end
}

/// Fetch values in a key range [start_key, end_key] inclusive, sorted by key
pub async fn get_values_in_range(
    start_key: &str,
    end_inclusive: &str,
    state: &mut AppState,
) -> Result<Vec<Item>, String> {
    perform_op(state, |mut client| async move {
        let end_exclusive = make_exclusive_end_from_inclusive(end_inclusive);
        let (sort_target, sort_order) =
            (etcd_client::SortTarget::Key, etcd_client::SortOrder::Ascend);
        let opt = GetOptions::new()
            .with_serializable()
            .with_range(end_exclusive.clone())
            .with_sort(sort_target, sort_order);
        let res = client.get(start_key, Some(opt)).await;
        if !is_out_of_range_error(&res) {
            return res.map(|response| {
                response
                    .kvs()
                    .iter()
                    .filter_map(|kv| {
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
                    .collect()
            });
        }
        log::warn!("Received out-of-range error, retrying...");
        // First we need to get the total count involved
        let count = client
            .get(
                start_key,
                Some(
                    GetOptions::new()
                        .with_serializable()
                        .with_range(end_exclusive.clone())
                        .with_count_only(),
                ),
            )
            .await
            .map(|res| res.count())?;
        log::info!(
            "Total keys in range ['{}', '{}']: {}",
            start_key,
            end_inclusive,
            count
        );

        let mut results = Vec::new();
        let mut tasks = LinkedList::new();
        tasks.push_back(BatchTask {
            from_key: start_key.as_bytes().to_vec(),
            limit: (count / 2).max(1),
        });

        // Process the next batch task in LIFO order to retain order
        while let Some(task) = tasks.pop_back() {
            log::debug!(
                "Fetching batch starting at '{}' with limit {}",
                String::from_utf8_lossy(&task.from_key),
                task.limit
            );
            let res = client
                .get(
                    task.from_key.clone(),
                    GetOptions::new()
                        .with_serializable()
                        .with_range(end_exclusive.clone())
                        .with_limit(task.limit)
                        .with_sort(sort_target, sort_order)
                        .into(),
                )
                .await;
            match res {
                Ok(mut res) => {
                    let kvs = res.take_kvs();
                    if kvs.is_empty() {
                        continue;
                    }
                    // Convert response to Items
                    let items: Vec<Item> = kvs
                        .into_iter()
                        .filter_map(|kv| {
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
                        .collect();
                    results.extend(items);

                    if res.more() {
                        // There are more keys to fetch, add a new task starting from the last key
                        let last_key = &results
                            .last()
                            .expect("Result should have at least one item")
                            .key;
                        tasks.push_back(BatchTask {
                            from_key: make_exclusive_end_from_inclusive(last_key),
                            limit: task.limit * 2, // Try doubling the batch size for the next attempt
                        });
                    }
                }
                e if is_out_of_range_error(&e) => {
                    // Still out of range, need to split further
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
        log::info!(
            "Successfully fetched {} items in range ['{}', '{}']",
            results.len(),
            start_key,
            end_inclusive
        );
        Ok(results)
    })
    .await
}

/// Add a new key-value pair to etcd
pub async fn put_key(key: &str, value: &str, state: &mut AppState) -> Result<(), String> {
    perform_op(state, |mut client| async move {
        client.put(key, value, None).await.map(|_| ())
    })
    .await
}

/// Delete a key from etcd
pub async fn delete_key(key: &str, state: &mut AppState) -> Result<(), String> {
    perform_op(state, |mut client| async move {
        client.delete(key, None).await.map(|_| ())
    })
    .await
}

/// Get cluster member list
pub async fn get_cluster_members(state: &mut AppState) -> Result<Vec<etcd_client::Member>, String> {
    perform_op(state, |mut client| async move {
        client
            .member_list()
            .await
            .map(|response| response.members().to_vec())
    })
    .await
}

/// Get cluster status for a specific endpoint
pub async fn get_cluster_status(
    state: &mut AppState,
) -> Result<etcd_client::StatusResponse, String> {
    perform_op(state, |mut client| async move { client.status().await }).await
}

/// Get a key's value at a specific revision
pub async fn get_key_at_revision(
    key: &str,
    revision: i64,
    state: &mut AppState,
) -> Result<Option<Item>, String> {
    perform_op(state, |mut client| async move {
        client
            .get(key, Some(GetOptions::new().with_revision(revision)))
            .await
            .map(|mut response| {
                if let Some(kv) = response.take_kvs().into_iter().next() {
                    if let (Ok(key_str), Ok(value_str)) = (
                        std::str::from_utf8(kv.key()),
                        std::str::from_utf8(kv.value()),
                    ) {
                        return Some(Item {
                            key: key_str.to_owned(),
                            value: value_str.to_owned(),
                            version: kv.version(),
                            create_revision: kv.create_revision(),
                            mod_revision: kv.mod_revision(),
                            lease: kv.lease(),
                        });
                    }
                }
                None
            })
    })
    .await
}
