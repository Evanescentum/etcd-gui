use crate::config::UpdateChannel;
use octocrab::{
    Octocrab,
    models::repos::Release,
    service::middleware::{cache::mem::InMemoryCache, retry::RetryConfig},
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
const GITHUB_OWNER: &str = "evanescentum";
const GITHUB_REPO: &str = "etcd-gui";

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub channel: UpdateChannel,
    pub current_version: String,
    pub update_available: bool,
    pub release: ReleaseInfo,
    pub cached: bool,
    pub checked_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub version: semver::Version,
    pub name: String,
    pub published_at: Option<String>,
    pub body: String,
    pub html_url: String,
    pub prerelease: bool,
}

fn to_release_info(rel: Release) -> Result<ReleaseInfo, String> {
    let version = semver::Version::parse(&rel.tag_name)
        .map_err(|e| format!("Invalid release tag semver '{}': {e}", rel.tag_name))?;

    Ok(ReleaseInfo {
        name: rel.name.clone().unwrap_or_else(|| rel.tag_name.clone()),
        tag_name: rel.tag_name,
        version,
        published_at: rel.published_at.map(|dt| dt.to_rfc3339()),
        body: rel.body.unwrap_or_default(),
        html_url: rel.html_url.to_string(),
        prerelease: rel.prerelease,
    })
}

pub fn build_octocrab() -> Result<Octocrab, String> {
    let token = std::env::var("ETCD_GUI_GITHUB_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("GITHUB_TOKEN")
                .ok()
                .filter(|v| !v.trim().is_empty())
        });

    let mut builder = Octocrab::builder()
        .cache(InMemoryCache::new())
        // The scheduler persists backoff; the client's immediate retries bypass it.
        .add_retry_config(RetryConfig::None)
        .set_connect_timeout(Some(Duration::from_secs(5)))
        .set_read_timeout(Some(Duration::from_secs(15)));
    if let Some(token) = token {
        builder = builder.personal_token(token);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build GitHub client: {e}"))
}

#[derive(Debug)]
pub enum UpdateError {
    RateLimited { retry_at: u64 },
    Failed(String),
}

impl From<String> for UpdateError {
    fn from(message: String) -> Self {
        Self::Failed(message)
    }
}

// GitHub documents Retry-After as seconds and X-RateLimit-Reset as Unix seconds.
fn rate_limit_deadline(
    status: u16,
    remaining: Option<&str>,
    reset: Option<&str>,
    retry_after: Option<&str>,
    message: &str,
    now: u64,
) -> Option<u64> {
    let limited = status == 429
        || (status == 403
            && (remaining == Some("0")
                || retry_after.is_some()
                || message.to_ascii_lowercase().contains("rate limit")));
    if !limited {
        return None;
    }
    let reset = if remaining == Some("0") {
        reset.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
    } else {
        0
    };
    let retry = retry_after
        .and_then(|s| s.parse::<u64>().ok())
        .map_or(0, |seconds| now.saturating_add(seconds));
    Some(reset.max(retry).max(now.saturating_add(60)))
}

async fn fetch_releases(crab: &Octocrab, route: &str) -> Result<Vec<Release>, UpdateError> {
    let response = crab
        ._get(route)
        .await
        .map_err(|_| "Could not reach GitHub. Please try again later.".to_string())?;
    let status = response.status().as_u16();
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let remaining = header("x-ratelimit-remaining");
    let reset = header("x-ratelimit-reset");
    let retry_after = header("retry-after");
    // Preserve header-based rate limits even if the error body is missing or invalid.
    let header_deadline = rate_limit_deadline(
        status,
        remaining.as_deref(),
        reset.as_deref(),
        retry_after.as_deref(),
        "",
        crate::update_schedule::unix_now(),
    );
    if let Some(retry_at) = header_deadline {
        return Err(UpdateError::RateLimited { retry_at });
    }
    let body = crab
        .body_to_string(response)
        .await
        .map_err(|_| "Could not read the GitHub response.".to_string())?;
    if !(200..300).contains(&status) {
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned)
            })
            .unwrap_or_default();
        if let Some(retry_at) = rate_limit_deadline(
            status,
            remaining.as_deref(),
            reset.as_deref(),
            retry_after.as_deref(),
            &message,
            crate::update_schedule::unix_now(),
        ) {
            return Err(UpdateError::RateLimited { retry_at });
        }
        return Err(UpdateError::Failed(format!(
            "GitHub update check failed (HTTP {status}). Please try again later."
        )));
    }
    serde_json::from_str(&body).map_err(|_| {
        UpdateError::Failed("GitHub returned invalid release information.".to_string())
    })
}

fn select_release(mut releases: Vec<Release>, channel: &UpdateChannel) -> Result<Release, String> {
    if matches!(channel, UpdateChannel::Beta) {
        return releases
            .into_iter()
            .next()
            .ok_or_else(|| "No releases found".to_string());
    }
    releases.sort_by(|a, b| {
        let a_ver = semver::Version::parse(&a.tag_name).ok();
        let b_ver = semver::Version::parse(&b.tag_name).ok();
        match (a_ver, b_ver) {
            (Some(av), Some(bv)) => bv.cmp(&av), // Sort descending
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });

    releases
        .into_iter()
        .find(|r| !r.prerelease)
        .ok_or_else(|| "No stable releases found".to_string())
}

pub async fn check_update(
    crab: &Octocrab,
    channel: UpdateChannel,
    current_version: semver::Version,
) -> Result<UpdateCheckResult, UpdateError> {
    let per_page = if matches!(channel, UpdateChannel::Stable) {
        50
    } else {
        1
    };
    let route = format!("/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases?per_page={per_page}");
    let releases = tokio::time::timeout(DEFAULT_TIMEOUT, fetch_releases(crab, &route))
        .await
        .map_err(|_| "GitHub update check timed out. Please try again later.".to_string())??;
    let latest_release = select_release(releases, &channel)?;
    let latest_release = to_release_info(latest_release)?;

    Ok(UpdateCheckResult {
        channel,
        current_version: current_version.to_string(),
        update_available: latest_release.version > current_version,
        release: latest_release,
        cached: false,
        checked_at: crate::update_schedule::unix_now(),
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        sync::mpsc,
    };

    pub fn release_json(version: &str, prerelease: bool) -> serde_json::Value {
        serde_json::json!({
            "url": "https://api.github.com/repos/test/test/releases/1",
            "html_url": "https://github.com/test/test/releases/1",
            "assets_url": "https://api.github.com/repos/test/test/releases/1/assets",
            "upload_url": "https://uploads.github.com/test", "id": 1,
            "node_id": "release", "tag_name": version, "target_commitish": "main",
            "name": version, "body": "Release notes", "draft": false,
            "prerelease": prerelease, "assets": []
        })
    }

    pub fn response(status: u16, headers: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n{headers}\r\n{body}",
            body.len()
        )
    }

    pub async fn mock_github(
        responses: Vec<String>,
    ) -> (Octocrab, mpsc::UnboundedReceiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock server");
        let address = listener.local_addr().expect("mock address");
        let (sender, receiver) = mpsc::unbounded_channel();
        tokio::spawn(async move {
            for response in responses {
                let (mut socket, _) = listener.accept().await.expect("accept request");
                let mut request = Vec::new();
                let mut buffer = [0u8; 1024];
                while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    let count = socket.read(&mut buffer).await.expect("read request");
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                }
                sender
                    .send(String::from_utf8_lossy(&request).to_string())
                    .expect("capture request");
                socket
                    .write_all(response.as_bytes())
                    .await
                    .expect("write response");
            }
        });
        let client = Octocrab::builder()
            .base_uri(format!("http://{address}"))
            .expect("mock base URI")
            .cache(InMemoryCache::new())
            .add_retry_config(RetryConfig::None)
            .build()
            .expect("mock client");
        (client, receiver)
    }

    #[test]
    fn rate_limits_honor_headers_without_misclassifying_other_errors() {
        assert_eq!(
            rate_limit_deadline(403, Some("0"), Some("500"), Some("600"), "", 100),
            Some(700)
        );
        assert_eq!(
            rate_limit_deadline(403, Some("0"), Some("500"), None, "", 100),
            Some(500)
        );
        assert_eq!(
            rate_limit_deadline(403, None, None, None, "API rate limit exceeded", 100),
            Some(160)
        );
        assert_eq!(
            rate_limit_deadline(429, None, Some("invalid"), Some("invalid"), "", 100),
            Some(160)
        );
        assert_eq!(
            rate_limit_deadline(403, Some("0"), Some("90"), None, "", 100),
            Some(160)
        );
        assert_eq!(
            rate_limit_deadline(403, Some("50"), None, None, "Resource not accessible", 100),
            None
        );
        assert_eq!(
            rate_limit_deadline(401, Some("0"), None, None, "Bad credentials", 100),
            None
        );
        assert_eq!(
            rate_limit_deadline(200, Some("0"), None, None, "", 100),
            None
        );
    }

    #[tokio::test]
    async fn client_reuses_etag_response_and_keeps_channel_selection() {
        let body = serde_json::json!([
            release_json("3.0.0-beta.1", true),
            release_json("1.0.0", false),
            release_json("2.0.0", false)
        ])
        .to_string();
        let (client, mut requests) = mock_github(vec![
            response(200, "ETag: \"releases\"\r\n", &body),
            response(304, "ETag: \"releases\"\r\n", ""),
            response(200, "", &body),
        ])
        .await;
        let current = semver::Version::new(1, 0, 0);
        for _ in 0..2 {
            let result = check_update(&client, UpdateChannel::Stable, current.clone())
                .await
                .expect("stable release");
            assert_eq!(result.release.version, semver::Version::new(2, 0, 0));
            assert!(result.update_available);
        }
        assert!(
            !requests
                .recv()
                .await
                .expect("first request")
                .to_ascii_lowercase()
                .contains("if-none-match")
        );
        assert!(
            requests
                .recv()
                .await
                .expect("second request")
                .to_ascii_lowercase()
                .contains("if-none-match: \"releases\"")
        );
        let beta = check_update(&client, UpdateChannel::Beta, current)
            .await
            .expect("beta release");
        assert_eq!(beta.release.tag_name, "3.0.0-beta.1");
        assert!(
            requests
                .recv()
                .await
                .expect("beta request")
                .contains("per_page=1 ")
        );
    }
}
