use etcd_client::Client;
use etcd_client::Error;
use etcd_client::GetOptions;

use crate::client::Item;

/// Fetch all keys with the specified prefix
pub async fn list_keys(prefix: &str, client: &mut Client) -> Result<Vec<Item>, Error> {
    client
        .get(prefix, Some(etcd_client::GetOptions::new().with_prefix()))
        .await
        .map(|mut response| {
            response
                .take_kvs()
                .into_iter()
                .filter_map(|kv| {
                    let (key, value) = kv.into_key_value();
                    if let (Ok(key_str), Ok(value_str)) =
                        (std::str::from_utf8(&key), std::str::from_utf8(&value))
                    {
                        Some(Item {
                            key: key_str.to_owned(),
                            value: value_str.to_owned(),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        })
}

/// Fetch only keys with the specified prefix
pub async fn list_keys_only(prefix: &str, client: &mut Client) -> Result<Vec<String>, Error> {
    client
        .get(
            prefix,
            GetOptions::new()
                .with_serializable()
                .with_prefix()
                .with_keys_only()
                .with_sort(etcd_client::SortTarget::Key, etcd_client::SortOrder::Ascend)
                .into(),
        )
        .await
        .map(|mut response| {
            response
                .take_kvs()
                .iter()
                .filter_map(|kv| std::str::from_utf8(kv.key()).ok().map(str::to_owned))
                .collect()
        })
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
    client: &mut Client,
) -> Result<Vec<Item>, Error> {
    let end_exclusive = make_exclusive_end_from_inclusive(end_inclusive);
    client
        .get(
            start_key,
            Some(
                GetOptions::new()
                    .with_serializable()
                    .with_range(end_exclusive)
                    .with_sort(etcd_client::SortTarget::Key, etcd_client::SortOrder::Ascend),
            ),
        )
        .await
        .map(|response| {
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
                        }),
                        _ => None,
                    }
                })
                .collect()
        })
}

/// Add a new key-value pair to etcd
pub async fn put_key(key: &str, value: &str, client: &mut Client) -> Result<(), Error> {
    client.put(key, value, None).await.map(|_| ())
}

/// Delete a key from etcd
pub async fn delete_key(key: &str, client: &mut Client) -> Result<(), Error> {
    client.delete(key, None).await.map(|_| ())
}
