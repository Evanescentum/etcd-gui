use crate::config::UpdateChannel;
use octocrab::{Octocrab, models::repos::Release, service::middleware::cache::mem::InMemoryCache};
use serde::Serialize;
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
}

#[derive(Debug, Clone, Serialize)]
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

fn build_octocrab() -> Result<Octocrab, String> {
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
        .set_connect_timeout(Some(Duration::from_secs(5)))
        .set_read_timeout(Some(Duration::from_secs(15)));
    if let Some(token) = token {
        builder = builder.personal_token(token);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build GitHub client: {e}"))
}

async fn fetch_latest_release(crab: &Octocrab) -> Result<Release, String> {
    let repo = crab.repos(GITHUB_OWNER, GITHUB_REPO);
    let releases = repo.releases();
    let result = releases.list().per_page(1).send().await;

    result
        .map_err(|e| format!("GitHub API error: {e:?}"))
        .and_then(|mut page| {
            page.take_items()
                .into_iter()
                .next()
                .ok_or_else(|| "No releases found".to_string())
        })
}

async fn fetch_latest_stable_release(crab: &Octocrab) -> Result<Release, String> {
    let repo = crab.repos(GITHUB_OWNER, GITHUB_REPO);
    let releases = repo.releases();
    let list = releases.list().per_page(50);
    let fut = list.send();

    let mut releases = tokio::time::timeout(DEFAULT_TIMEOUT, fut)
        .await
        .map_err(|_| "GitHub request timed out".to_string())?
        .map_err(|e| format!("GitHub API error: {e}"))?
        .take_items();

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

    Ok(releases
        .into_iter()
        .filter(|r| !r.prerelease)
        .next()
        .ok_or_else(|| "No stable releases found".to_string())?)
}

pub async fn check_update(
    channel: UpdateChannel,
    current_version: semver::Version,
) -> Result<UpdateCheckResult, String> {
    let crab = build_octocrab()?;

    let latest_release = match channel {
        UpdateChannel::Stable => fetch_latest_stable_release(&crab).await?,
        UpdateChannel::Beta => fetch_latest_release(&crab).await?,
    };
    let latest_release = to_release_info(latest_release)?;

    Ok(UpdateCheckResult {
        channel,
        current_version: current_version.to_string(),
        update_available: latest_release.version > current_version,
        release: latest_release,
    })
}
