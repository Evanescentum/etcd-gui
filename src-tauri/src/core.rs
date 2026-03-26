mod split_batch;

use etcd_client::{Client, Error, GetOptions, SortOrder, SortTarget};

use crate::client::{KvEntry, is_auth_token_expired};
use crate::core::split_batch::{
    KeysOnlySplitter, KvSplitter, deliver_in_chunks, is_out_of_range_error, stream_range_batched,
};
use crate::state::AppState;

pub struct CountResult {
    pub total: i64,
    pub revision: i64,
}

pub struct KeyBatch {
    pub keys: Vec<Vec<u8>>,
    pub more: bool,
}

fn item_from_kv(kv: etcd_client::KeyValue) -> Option<KvEntry> {
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
}

async fn perform_op<T, F, Fut>(state: &mut AppState, f: F) -> Result<T, String>
where
    F: Fn(Client) -> Fut,
    Fut: std::future::Future<Output = Result<T, Error>>,
{
    let client = state.get_client().await?.clone();
    let res = f(client).await;

    if is_auth_token_expired(&res) {
        log::warn!("Refreshing client connection...");
        state.etcd_client = None;
        let client = state.get_client().await?.clone();
        f(client).await.map_err(|e| e.to_string())
    } else {
        res.map_err(|e| e.to_string())
    }
}

pub async fn count_keys(
    client: &mut Client,
    prefix: &str,
    revision: Option<i64>,
) -> Result<CountResult, Error> {
    let range_end = range_end_of_prefix(prefix.as_bytes());
    client
        .get(
            prefix,
            Some(apply_revision(
                GetOptions::new()
                    .with_serializable()
                    .with_range(range_end)
                    .with_count_only(),
                revision,
            )),
        )
        .await
        .map(|response| CountResult {
            total: response.count(),
            revision: response
                .header()
                .map(|header| header.revision())
                .unwrap_or(0),
        })
}

pub async fn stream_items<F>(
    client: &mut Client,
    start_key: &[u8],
    range_end: &[u8],
    revision: Option<i64>,
    mut on_chunk: F,
) -> Result<(), String>
where
    F: FnMut(Vec<KvEntry>) -> Result<(), String>,
{
    let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
    let opt = apply_revision(
        GetOptions::new()
            .with_serializable()
            .with_range(range_end.to_vec())
            .with_sort(sort_target, sort_order),
        revision,
    );
    let res = client.get(start_key.to_vec(), Some(opt)).await;

    if !split_batch::is_out_of_range_error(&res) {
        let mut response = res.map_err(|e| e.to_string())?;
        return deliver_in_chunks(&KvSplitter, response.take_kvs(), &mut on_chunk);
    }

    log::warn!("Received out-of-range error, retrying with streaming batches...");

    stream_range_batched(
        client,
        KvSplitter,
        (start_key.to_vec(), range_end.to_vec()),
        (sort_target, sort_order),
        revision,
        on_chunk,
    )
    .await
}

pub async fn list_items(
    client: &mut Client,
    start_key: &[u8],
    range_end: &[u8],
    limit: i64,
    revision: Option<i64>,
) -> Result<Vec<KvEntry>, String> {
    let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
    client
        .get(
            start_key.to_vec(),
            Some(apply_revision(
                GetOptions::new()
                    .with_serializable()
                    .with_range(range_end.to_vec())
                    .with_sort(sort_target, sort_order)
                    .with_limit(limit),
                revision,
            )),
        )
        .await
        .map_err(|e| e.to_string())
        .map(|mut response| {
            response
                .take_kvs()
                .into_iter()
                .filter_map(item_from_kv)
                .collect()
        })
}

pub async fn stream_keys<F>(
    client: &mut Client,
    start_key: &[u8],
    range_end: &[u8],
    revision: Option<i64>,
    mut on_chunk: F,
) -> Result<(), String>
where
    F: FnMut(Vec<Vec<u8>>) -> Result<(), String>,
{
    let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
    let opt = apply_revision(
        GetOptions::new()
            .with_serializable()
            .with_range(range_end.to_vec())
            .with_keys_only()
            .with_sort(sort_target, sort_order),
        revision,
    );
    let res = client.get(start_key.to_vec(), Some(opt)).await;

    if !is_out_of_range_error(&res) {
        let mut response = res.map_err(|e| e.to_string())?;
        let kvs = response.take_kvs();
        let keys = kvs.into_iter().map(|kv| kv.into_key_value().0).collect();
        return on_chunk(keys);
    }

    log::warn!("Received out-of-range error, retrying with streaming batches...");

    stream_range_batched(
        client,
        KeysOnlySplitter,
        (start_key.to_vec(), range_end.to_vec()),
        (sort_target, sort_order),
        revision,
        |chunk| {
            let keys = chunk.into_iter().map(String::into_bytes).collect();
            on_chunk(keys)
        },
    )
    .await
}

pub async fn list_keys(
    client: &mut Client,
    start_key: &[u8],
    range_end: &[u8],
    limit: i64,
    revision: Option<i64>,
) -> Result<KeyBatch, String> {
    let (sort_target, sort_order) = (SortTarget::Key, SortOrder::Ascend);
    client
        .get(
            start_key.to_vec(),
            Some(apply_revision(
                GetOptions::new()
                    .with_serializable()
                    .with_range(range_end.to_vec())
                    .with_keys_only()
                    .with_sort(sort_target, sort_order)
                    .with_limit(limit),
                revision,
            )),
        )
        .await
        .map_err(|e| e.to_string())
        .map(|mut response| KeyBatch {
            keys: response
                .take_kvs()
                .into_iter()
                .map(|kv| kv.into_key_value().0)
                .collect(),
            more: response.more(),
        })
}

pub async fn get_values(
    client: &mut Client,
    keys: &[Vec<u8>],
    revision: Option<i64>,
) -> Result<Vec<KvEntry>, String> {
    let mut items = Vec::with_capacity(keys.len());

    for key in keys {
        let mut response = client
            .get(
                key.clone(),
                Some(apply_revision(
                    GetOptions::new().with_serializable(),
                    revision,
                )),
            )
            .await
            .map_err(|e| e.to_string())?;

        if let Some(kv) = response.take_kvs().into_iter().next()
            && let Some(item) = item_from_kv(kv)
        {
            items.push(item);
        }
    }

    Ok(items)
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

pub(crate) fn apply_revision(options: GetOptions, revision: Option<i64>) -> GetOptions {
    if let Some(revision) = revision {
        options.with_revision(revision)
    } else {
        options
    }
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
) -> Result<Option<KvEntry>, String> {
    perform_op(state, |mut client| async move {
        client
            .get(key, Some(GetOptions::new().with_revision(revision)))
            .await
            .map(|mut response| {
                if let Some(kv) = response.take_kvs().into_iter().next() {
                    return item_from_kv(kv);
                }
                None
            })
    })
    .await
}
