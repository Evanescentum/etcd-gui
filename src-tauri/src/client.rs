use etcd_client::{Client, ConnectOptions};
use serde::{Deserialize, Serialize};

use crate::config::Profile;

/// Represents a key-value pair from etcd
#[derive(Serialize, Deserialize, Debug)]
pub struct Item {
    pub key: String,
    pub value: String,
}

pub async fn new_connect(profile: &Profile) -> Result<etcd_client::Client, String> {
    let endpoints: Vec<String> = profile
        .endpoints
        .iter()
        .map(|endpoint| format!("{}:{}", endpoint.host, endpoint.port))
        .collect();

    // Build connection options
    let mut options = ConnectOptions::new();
    if let Some((username, password)) = &profile.user {
        options = options.with_user(username, password);
    }
    if let Some(timeout) = profile.timeout_ms {
        options = options.with_timeout(std::time::Duration::from_millis(timeout));
    }
    if let Some(connect_timeout) = profile.connect_timeout_ms {
        options = options.with_connect_timeout(std::time::Duration::from_millis(connect_timeout));
    }

    Client::connect(endpoints, Some(options))
        .await
        .map_err(|err| format!("Failed to connect to etcd: {}", err))
}

pub fn should_refresh<T>(res: &Result<T, etcd_client::Error>) -> bool {
    match res {
        Err(etcd_client::Error::GRpcStatus(status)) => {
            status.code() == tonic::Code::Unauthenticated
                && status.message().contains("invalid auth token")
        }
        _ => false,
    }
}
