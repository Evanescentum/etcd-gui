use etcd_client::Client;
use etcd_client::Error;

use crate::client::Item;

/// Fetch all keys with the specified prefix
pub async fn list_keys(prefix: &str, client: &mut Client) -> Result<Vec<Item>, Error> {
    client
        .get(prefix, Some(etcd_client::GetOptions::new().with_prefix()))
        .await
        .map(|response| {
            let mut items = Vec::new();
            for kv in response.kvs() {
                // Convert key and value bytes to UTF-8 strings
                if let (Ok(key_str), Ok(value_str)) = (
                    std::str::from_utf8(kv.key()),
                    std::str::from_utf8(kv.value()),
                ) {
                    items.push(Item {
                        key: key_str.to_string(),
                        value: value_str.to_string(),
                    });
                }
            }
            items
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
