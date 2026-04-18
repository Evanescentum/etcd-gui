use std::collections::HashMap;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::snapshot::{SharedSnapshot, SnapshotKey, SnapshotStore};

/// Owns the lifecycle of dashboard queries and their revision-scoped snapshots.
///
/// The manager exposes a small query-oriented API: starting a new dashboard query
/// automatically cancels the previous one, and snapshot caches are reused only by
/// the backend query pipeline for the exact profile fingerprint and revision.
#[derive(Default)]
pub struct QueryManager {
    active_dashboard_query: Option<CancellationToken>,
    snapshots: HashMap<SnapshotKey, SharedSnapshot>,
}

impl QueryManager {
    /// Starts a new dashboard query and cancels any previous active query.
    pub fn begin_dashboard_query(&mut self) -> CancellationToken {
        if let Some(active_query) = self.active_dashboard_query.take() {
            active_query.cancel();
        }

        let cancelled = CancellationToken::new();
        self.active_dashboard_query = Some(cancelled.clone());
        cancelled
    }

    /// Returns the snapshot cache for a specific profile fingerprint and revision.
    pub fn snapshot_for(&mut self, profile_fingerprint: u64, revision: i64) -> SharedSnapshot {
        self.snapshots
            .entry(SnapshotKey {
                profile_fingerprint,
                revision,
            })
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(SnapshotStore::default())))
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::QueryManager;

    #[test]
    fn begin_dashboard_query_cancels_previous_session() {
        let mut manager = QueryManager::default();
        let first = manager.begin_dashboard_query();
        let second = manager.begin_dashboard_query();

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());

        second.cancel();
        assert!(
            manager
                .active_dashboard_query
                .as_ref()
                .expect("active dashboard query should be tracked")
                .is_cancelled()
        );
    }
}
