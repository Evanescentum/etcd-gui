use etcd_client::{Client, ConnectOptions};
use serde::{Deserialize, Serialize};

use crate::config::Profile;

/// Represents a key-value pair from etcd
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KvEntry {
    pub key: String,
    pub value: String,
    pub version: i64,
    pub create_revision: i64,
    pub mod_revision: i64,
    pub lease: i64,
}

pub async fn connect(profile: &Profile) -> Result<etcd_client::Client, String> {
    log::info!("Connecting to etcd with profile: {}", profile.name);
    let endpoints: Vec<String> = profile
        .endpoints
        .iter()
        .map(|endpoint| format!("{}:{}", endpoint.host, endpoint.port))
        .collect();

    // Build connection options
    let mut options = ConnectOptions::new();
    if let Some((username, password)) = &profile.user {
        log::debug!("Using authentication for user: {}", username);
        options = options.with_user(username, password.as_str());
    }
    if let Some(timeout) = profile.timeout_ms {
        options = options.with_timeout(std::time::Duration::from_millis(timeout));
    }
    if let Some(connect_timeout) = profile.connect_timeout_ms {
        options = options.with_connect_timeout(std::time::Duration::from_millis(connect_timeout));
    }

    Client::connect(endpoints, Some(options))
        .await
        .map_err(|err| {
            log::error!("Failed to connect to etcd: {}", err);
            format!("Failed to connect to etcd: {}", err)
        })
}

pub fn is_auth_token_expired<T>(res: &Result<T, etcd_client::Error>) -> bool {
    match res {
        Err(etcd_client::Error::GRpcStatus(status)) => {
            status.code() == tonic::Code::Unauthenticated
                && status.message().contains("invalid auth token")
        }
        _ => false,
    }
}

pub fn is_invalid_auth_token_error(error: &str) -> bool {
    error.contains("invalid auth token")
}
