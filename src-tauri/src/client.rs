use etcd_client::{Client, ConnectOptions};

use crate::config::Profile;

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
        log::debug!("Using authentication for user: {username}");
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
            log::error!("Failed to connect to etcd: {err}");
            format!("Failed to connect to etcd: {err}")
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
