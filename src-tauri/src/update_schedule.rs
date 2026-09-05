use crate::config::{UpdateChannel, UpdateCheckSchedule};
use crate::update::{self, ReleaseInfo, UpdateCheckResult, UpdateError};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CheckHistory {
    last_attempt: HashMap<String, u64>,
    releases: HashMap<String, CachedRelease>,
    retries: HashMap<String, RetryState>,
    rate_limit_until: u64,
}

#[derive(Serialize, Deserialize)]
struct CachedRelease {
    checked_at: u64,
    release: ReleaseInfo,
}

#[derive(Default, Serialize, Deserialize)]
struct RetryState {
    failures: u32,
    retry_at: u64,
}

impl CheckHistory {
    pub fn delay(
        &self,
        channel: &UpdateChannel,
        schedule: &UpdateCheckSchedule,
        now: u64,
    ) -> Option<Duration> {
        let interval = schedule.interval_duration()?;
        let delay = self
            .last_attempt
            .get(&channel.to_string())
            .map_or(0, |last| {
                // Recover from a clock correction instead of delaying checks indefinitely.
                if *last > now {
                    0
                } else {
                    last.saturating_add(interval.as_secs()).saturating_sub(now)
                }
            });
        let delay = self
            .retries
            .get(&channel.to_string())
            .map_or(delay, |retry| retry.retry_at.saturating_sub(now));
        Some(Duration::from_secs(
            delay.max(self.rate_limit_until.saturating_sub(now)),
        ))
    }

    pub fn record(&mut self, channel: &UpdateChannel, now: u64) {
        self.last_attempt.insert(channel.to_string(), now);
    }

    fn failed(&mut self, channel: &UpdateChannel, error: &UpdateError, now: u64) -> u64 {
        let retry = self.retries.entry(channel.to_string()).or_default();
        retry.failures = retry.failures.saturating_add(1);
        let backoff = 60u64
            .saturating_mul(1u64 << retry.failures.saturating_sub(1).min(6))
            .min(3600);
        retry.retry_at = now.saturating_add(backoff);
        if let UpdateError::RateLimited { retry_at } = error {
            self.rate_limit_until = self.rate_limit_until.max(*retry_at).max(retry.retry_at);
            retry.retry_at = self.rate_limit_until;
        }
        retry.retry_at
    }

    pub fn cached_result(
        &self,
        channel: &UpdateChannel,
        current_version: &semver::Version,
    ) -> Option<UpdateCheckResult> {
        let cache = self.releases.get(&channel.to_string())?;
        Some(UpdateCheckResult {
            channel: channel.clone(),
            current_version: current_version.to_string(),
            update_available: cache.release.version > *current_version,
            release: cache.release.clone(),
            cached: true,
            checked_at: cache.checked_at,
        })
    }
}

pub struct UpdateSchedule {
    pub history: CheckHistory,
    path: PathBuf,
    client: Option<octocrab::Octocrab>,
}

impl UpdateSchedule {
    pub fn load(path: PathBuf) -> Self {
        let history = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|err| {
                log::warn!("Ignoring invalid update check history: {err}");
                CheckHistory::default()
            }),
            Err(err) => {
                if err.kind() != std::io::ErrorKind::NotFound {
                    log::warn!("Failed to read update check history: {err}");
                }
                CheckHistory::default()
            }
        };
        Self {
            history,
            path,
            client: None,
        }
    }

    // Callers hold one shared mutex across this method, serializing automatic and manual checks.
    pub async fn check(
        &mut self,
        channel: UpdateChannel,
        current_version: semver::Version,
    ) -> Result<UpdateCheckResult, String> {
        let now = unix_now();
        if self.history.rate_limit_until > now {
            return Err(retry_message(
                "GitHub update checks are temporarily rate limited",
                self.history.rate_limit_until,
            ));
        }
        if let Some(retry) = self.history.retries.get(&channel.to_string()) {
            if retry.retry_at > now {
                return Err(retry_message(
                    "Update checks are temporarily paused after a failed request",
                    retry.retry_at,
                ));
            }
        } else if let Some(result) = self.history.cached_result(&channel, &current_version) {
            // Coalesce manual clicks (including queued concurrent checks) for one minute.
            if now >= result.checked_at && now - result.checked_at < 60 {
                return Ok(result);
            }
        }
        self.history.record(&channel, now);
        self.save();
        let result = async {
            if self.client.is_none() {
                self.client = Some(update::build_octocrab()?);
            }
            let client = self.client.as_ref().ok_or_else(|| {
                UpdateError::Failed("Could not initialize the update client.".to_string())
            })?;
            update::check_update(client, channel.clone(), current_version).await
        }
        .await;
        match result {
            Ok(result) => {
                self.history.releases.insert(
                    channel.to_string(),
                    CachedRelease {
                        checked_at: result.checked_at,
                        release: result.release.clone(),
                    },
                );
                self.history.retries.remove(&channel.to_string());
                self.history.rate_limit_until = 0;
                self.save();
                Ok(result)
            }
            Err(error) => {
                let retry_at = self.history.failed(&channel, &error, unix_now());
                self.save();
                Err(match error {
                    UpdateError::RateLimited { .. } => retry_message(
                        "GitHub update checks are temporarily rate limited",
                        retry_at,
                    ),
                    UpdateError::Failed(message) => format!(
                        "{message} {}",
                        retry_message("Update checks are paused", retry_at)
                    ),
                })
            }
        }
    }

    pub fn save(&self) {
        let write = || -> Result<(), Box<dyn std::error::Error>> {
            if let Some(parent) = self.path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let temporary = self.path.with_extension("json.tmp");
            std::fs::write(&temporary, serde_json::to_vec(&self.history)?)?;
            std::fs::rename(temporary, &self.path)?;
            Ok(())
        };
        if let Err(err) = write() {
            log::warn!("Failed to save update check history: {err}");
        }
    }
}

fn retry_message(reason: &str, retry_at: u64) -> String {
    let seconds = retry_at.saturating_sub(unix_now()).max(1);
    format!(
        "{reason}. Please try again in {} minute(s).",
        seconds.div_ceil(60)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::update::tests::{mock_github, release_json, response};

    fn test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "etcd-gui-update-{name}-{}.json",
            std::process::id()
        ))
    }

    #[test]
    fn failures_back_off_exponentially_and_old_history_still_loads() {
        let mut history: CheckHistory =
            serde_json::from_str(r#"{"last_attempt":{"Beta":100}}"#).expect("old history");
        for (index, expected) in [60, 120, 240, 480, 960, 1920, 3600, 3600]
            .into_iter()
            .enumerate()
        {
            let now = 200 + index as u64;
            assert_eq!(
                history.failed(
                    &UpdateChannel::Beta,
                    &UpdateError::Failed("offline".into()),
                    now
                ),
                now + expected
            );
            assert_eq!(
                history.delay(&UpdateChannel::Beta, &UpdateCheckSchedule::Daily, now),
                Some(Duration::from_secs(expected))
            );
        }
    }

    #[tokio::test]
    async fn rate_limit_survives_restart_blocks_both_channels_and_recovers() {
        let path = test_path("rate-limit");
        let deadline = unix_now() + 600;
        let body = serde_json::json!([release_json("2.0.0", false)]).to_string();
        let (client, mut requests) = mock_github(vec![
            response(
                403,
                &format!("X-RateLimit-Remaining: 0\r\nX-RateLimit-Reset: {deadline}\r\n"),
                "not JSON",
            ),
            response(200, "", &body),
        ])
        .await;
        let current = semver::Version::new(1, 0, 0);
        let mut updates = UpdateSchedule::load(path.clone());
        updates.client = Some(client.clone());
        let error = updates
            .check(UpdateChannel::Beta, current.clone())
            .await
            .expect_err("limited");
        assert!(error.contains("rate limited"));
        requests.try_recv().expect("one HTTP request");
        let mut restored = UpdateSchedule::load(path.clone());
        restored.client = Some(client);
        for channel in [UpdateChannel::Beta, UpdateChannel::Stable] {
            assert!(
                restored
                    .check(channel, current.clone())
                    .await
                    .expect_err("still limited")
                    .contains("rate limited")
            );
        }
        assert!(requests.try_recv().is_err());
        assert!(restored.history.rate_limit_until >= deadline);
        assert_eq!(
            restored.history.delay(
                &UpdateChannel::Beta,
                &UpdateCheckSchedule::Never,
                unix_now()
            ),
            None
        );
        restored.history.rate_limit_until = 0;
        restored
            .history
            .retries
            .get_mut("Beta")
            .expect("retry state")
            .retry_at = 0;
        assert!(
            restored
                .check(UpdateChannel::Beta, current)
                .await
                .expect("recovered")
                .update_available
        );
        assert!(restored.history.retries.is_empty());
        assert_eq!(restored.history.rate_limit_until, 0);
        std::fs::remove_file(path).expect("remove test history");
    }

    #[tokio::test]
    async fn release_cache_survives_restart_and_does_not_hide_failed_refresh() {
        let path = test_path("cache");
        let body = serde_json::json!([release_json("2.0.0", false)]).to_string();
        let (client, mut requests) = mock_github(vec![
            response(200, "", &body),
            response(403, "", r#"{"message":"Resource not accessible"}"#),
        ])
        .await;
        let mut updates = UpdateSchedule::load(path.clone());
        updates.client = Some(client.clone());
        let current = semver::Version::new(1, 0, 0);
        assert!(
            !updates
                .check(UpdateChannel::Beta, current.clone())
                .await
                .expect("live result")
                .cached
        );
        requests.try_recv().expect("one HTTP request");
        let mut restored = UpdateSchedule::load(path.clone());
        restored.client = Some(client);
        let result = restored
            .check(UpdateChannel::Beta, semver::Version::new(2, 0, 0))
            .await
            .expect("cached result");
        assert!(result.cached);
        assert!(!result.update_available); // Compare against the running app, not its previous version.
        assert!(requests.try_recv().is_err());
        assert!(
            restored
                .history
                .cached_result(&UpdateChannel::Stable, &current)
                .is_none()
        );
        restored
            .history
            .releases
            .get_mut("Beta")
            .expect("cache")
            .checked_at -= 61;
        let error = restored
            .check(UpdateChannel::Beta, current)
            .await
            .expect_err("failed refresh");
        assert!(error.contains("HTTP 403"));
        assert!(!error.contains("rate limited"));
        assert_eq!(restored.history.rate_limit_until, 0);
        assert!(restored.history.releases.contains_key("Beta"));
        std::fs::remove_file(path).expect("remove test history");
    }

    #[test]
    fn saved_history_survives_restart_and_manual_checks_reset_deadline() {
        let path =
            std::env::temp_dir().join(format!("etcd-gui-update-{}.json", std::process::id()));
        let mut state = UpdateSchedule::load(path.clone());
        state.history.record(&UpdateChannel::Beta, 100);
        state.save();
        state.history.record(&UpdateChannel::Beta, 200);
        state.save();
        let restored = UpdateSchedule::load(path.clone());
        assert_eq!(
            restored
                .history
                .delay(&UpdateChannel::Beta, &UpdateCheckSchedule::Daily, 210),
            Some(Duration::from_secs(86400 - 10))
        );
        std::fs::remove_file(path).expect("remove test history");
    }

    #[test]
    fn restart_preserves_remaining_interval_and_channel_isolation() {
        let mut history = CheckHistory::default();
        history.record(&UpdateChannel::Beta, 100);
        let restored: CheckHistory =
            serde_json::from_str(&serde_json::to_string(&history).expect("serialize"))
                .expect("deserialize");
        assert_eq!(
            restored.delay(&UpdateChannel::Beta, &UpdateCheckSchedule::Daily, 110),
            Some(Duration::from_secs(86400 - 10))
        );
        assert_eq!(
            restored.delay(&UpdateChannel::Stable, &UpdateCheckSchedule::Daily, 110),
            Some(Duration::ZERO)
        );
        assert_eq!(
            restored.delay(&UpdateChannel::Beta, &UpdateCheckSchedule::Daily, 86500),
            Some(Duration::ZERO)
        );
    }

    #[test]
    fn schedule_changes_use_last_attempt_and_never_disables_checks() {
        let mut history = CheckHistory::default();
        history.record(&UpdateChannel::Stable, 100);
        for (schedule, days) in [
            (UpdateCheckSchedule::Daily, 1),
            (UpdateCheckSchedule::Weekly, 7),
            (UpdateCheckSchedule::Monthly, 30),
        ] {
            assert_eq!(
                history.delay(&UpdateChannel::Stable, &schedule, 110),
                Some(Duration::from_secs(days * 86400 - 10))
            );
        }
        assert_eq!(
            history.delay(&UpdateChannel::Stable, &UpdateCheckSchedule::Never, 110),
            None
        );
        assert_eq!(
            history.delay(&UpdateChannel::Stable, &UpdateCheckSchedule::Daily, 90),
            Some(Duration::ZERO)
        );
    }
}
