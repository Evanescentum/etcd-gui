use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::snapshot::{SharedSnapshot, SnapshotKey, SnapshotStore};

/// Owns the lifecycle of dashboard queries and their revision-scoped snapshots.
///
/// The manager exposes a small query-oriented API: starting a new dashboard query
/// automatically cancels the previous one, and snapshot caches are reused only by
/// the backend query pipeline for the exact profile fingerprint and revision.
#[derive(Default)]
pub struct QueryManager {
    active_dashboard_query: Option<Arc<AtomicBool>>,
    snapshots: HashMap<SnapshotKey, SharedSnapshot>,
}

impl QueryManager {
    /// Starts a new dashboard query and cancels any previous active query.
    pub fn begin_dashboard_query(&mut self) -> Arc<AtomicBool> {
        if let Some(active_query) = self.active_dashboard_query.take() {
            active_query.store(true, Ordering::Relaxed);
        }

        let cancelled = Arc::new(AtomicBool::new(false));
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
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use super::QueryManager;

    #[test]
    fn begin_dashboard_query_cancels_previous_session() {
        let mut manager = QueryManager::default();
        let first = manager.begin_dashboard_query();
        let second = manager.begin_dashboard_query();

        assert!(first.load(Ordering::Relaxed));
        assert!(!second.load(Ordering::Relaxed));
        assert!(Arc::ptr_eq(
            manager.active_dashboard_query.as_ref().unwrap(),
            &second
        ));
    }
}
