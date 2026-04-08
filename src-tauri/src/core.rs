mod split_batch;

use std::ops::Range;

use etcd_client::GetOptions;

pub use split_batch::{KeysOnlySplitter, KvSplitter, Splittable, execute_splittable, item_from_kv};

use crate::snapshot::KvEntry;
use crate::state::AppState;

pub struct CountResult {
    pub total: i64,
    pub revision: i64,
}

pub fn key_after(key: &[u8]) -> Vec<u8> {
    let mut next = Vec::with_capacity(key.len() + 1);
    next.extend_from_slice(key);
    next.push(0);
    next
}

pub fn range_end_of_prefix(prefix_key: &[u8]) -> Vec<u8> {
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

pub async fn count_keys(
    range: Range<Vec<u8>>,
    revision: Option<i64>,
    state: &mut AppState,
) -> Result<CountResult, String> {
    log::debug!(
        "Counting keys in range: {} - {} at revision {:?}",
        String::from_utf8_lossy(&range.start),
        String::from_utf8_lossy(&range.end),
        revision
    );
    state
        .perform_op(async |mut client: etcd_client::Client| {
            client
                .get(
                    range.clone().start,
                    Some(apply_revision(
                        GetOptions::new()
                            .with_serializable()
                            .with_range(range.clone().end)
                            .with_count_only(),
                        revision,
                    )),
                )
                .await
                .map(|response| CountResult {
                    total: response.count(),
                    revision: response
                        .header()
                        .map_or(0, etcd_client::ResponseHeader::revision),
                })
        })
        .await
}

/// Add a new key-value pair to etcd
pub async fn put_key(key: &str, value: &str, state: &mut AppState) -> Result<(), String> {
    state
        .perform_op(async |mut client: etcd_client::Client| {
            client.put(key, value, None).await.map(|_| ())
        })
        .await
}

/// Delete a key from etcd
pub async fn delete_key(key: &str, state: &mut AppState) -> Result<(), String> {
    state
        .perform_op(async |mut client: etcd_client::Client| {
            client.delete(key, None).await.map(|_| ())
        })
        .await
}

/// Get cluster member list
pub async fn get_cluster_members(state: &mut AppState) -> Result<Vec<etcd_client::Member>, String> {
    state
        .perform_op(async |mut client: etcd_client::Client| {
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
    state
        .perform_op(async |mut client: etcd_client::Client| client.status().await)
        .await
}

/// Get a key's value at a specific revision
pub async fn get_key_at_revision(
    key: &str,
    revision: i64,
    state: &mut AppState,
) -> Result<Option<KvEntry>, String> {
    state
        .perform_op(async |mut client: etcd_client::Client| {
            client
                .get(key, Some(GetOptions::new().with_revision(revision)))
                .await
                .map(|mut response| {
                    if let Some(kv) = response.take_kvs().into_iter().next() {
                        return item_from_kv(kv, false);
                    }
                    None
                })
        })
        .await
}
