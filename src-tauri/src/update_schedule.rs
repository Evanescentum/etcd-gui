use crate::config::{UpdateChannel, UpdateCheckSchedule};
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
pub struct CheckHistory {
    last_attempt: HashMap<String, u64>,
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
        Some(Duration::from_secs(delay))
    }

    pub fn record(&mut self, channel: &UpdateChannel, now: u64) {
        self.last_attempt.insert(channel.to_string(), now);
    }
}

pub struct UpdateSchedule {
    pub history: CheckHistory,
    path: PathBuf,
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
        Self { history, path }
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

#[cfg(test)]
mod tests {
    use super::*;

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
