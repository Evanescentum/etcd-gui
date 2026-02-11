mod split_batch;

use etcd_client::{Client, Error, GetOptions, SortOrder, SortTarget};

use crate::client::{Item, should_refresh};
use crate::core::split_batch::{
    KeysOnlySplitter, KvSplitter, ValuesInRangeSplitter, execute_splittable, is_out_of_range_error,
};
use crate::state::AppState;

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
        let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
        let opt = GetOptions::new()
            .with_serializable()
            .with_range(range_end.clone())
            .with_sort(sort_target, sort_order);
        let res = client.get(prefix, Some(opt)).await;
        if !split_batch::is_out_of_range_error(&res) {
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

        // Trait-based approach
        execute_splittable(
            &mut client,
            KvSplitter,
            (prefix, range_end),
            (sort_target, sort_order),
        )
        .await
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
        let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
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

        // Trait-based approach
        execute_splittable(
            &mut client,
            KeysOnlySplitter,
            (prefix, range_end),
            (sort_target, sort_order),
        )
        .await
    })
    .await
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
        let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
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

        // Trait-based approach
        execute_splittable(
            &mut client,
            ValuesInRangeSplitter,
            (start_key, end_exclusive),
            (sort_target, sort_order),
        )
        .await
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
