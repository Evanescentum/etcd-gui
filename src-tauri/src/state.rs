use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::config;
use crate::snapshot::{SharedSnapshot, SnapshotKey, SnapshotStore};

#[derive(Default)]
pub struct AppState {
    pub app_config: config::AppConfig,

    pub etcd_client: Option<etcd_client::Client>,
    query_sessions: HashMap<String, Arc<AtomicBool>>,
    snapshots: HashMap<SnapshotKey, SharedSnapshot>,
}

impl AppState {
    pub fn new(app_handle: &tauri::AppHandle) -> std::io::Result<Self> {
        let app_config = config::AppConfig::from_file(
            config::AppConfig::get_config_path(app_handle).map_err(std::io::Error::other)?,
        )?;
        Ok(AppState {
            app_config,
            etcd_client: None,
            query_sessions: HashMap::new(),
            snapshots: HashMap::new(),
        })
    }

    pub fn start_query_session(&mut self, request_id: String) -> Arc<AtomicBool> {
        let cancelled = Arc::new(AtomicBool::new(false));

        if let Some(existing) = self.query_sessions.insert(request_id, cancelled.clone()) {
            existing.store(true, Ordering::Relaxed);
        }

        cancelled
    }

    pub fn cancel_query_session(&mut self, request_id: &str) -> bool {
        let Some(cancelled) = self.query_sessions.get(request_id) else {
            return false;
        };

        cancelled.store(true, Ordering::Relaxed);
        true
    }

    pub fn finish_query_session(&mut self, request_id: &str) {
        self.query_sessions.remove(request_id);
    }

    pub fn current_profile_fingerprint(&self) -> Result<String, String> {
        let profile = self
            .app_config
            .get_current_profile()
            .ok_or_else(|| "Could not find current profile".to_string())?;
        profile.fingerprint()
    }

    pub fn get_or_create_snapshot(
        &mut self,
        snapshot_key: SnapshotKey,
    ) -> SharedSnapshot {
        self.snapshots
            .entry(snapshot_key)
            .or_insert_with(|| Arc::new(std::sync::RwLock::new(SnapshotStore::default())))
            .clone()
    }

    pub fn invalidate_current_profile_snapshots(&mut self) -> Result<(), String> {
        let fingerprint = self.current_profile_fingerprint()?;
        self.snapshots
            .retain(|key, _| key.profile_fingerprint != fingerprint);
        Ok(())
    }

    pub fn clear_snapshots(&mut self) {
        self.snapshots.clear();
    }

    pub async fn init_client(&mut self) -> Result<bool, String> {
        if self.etcd_client.is_some() {
            return Ok(true);
        }

        let Some(current_profile) = self.app_config.get_current_profile() else {
            return Ok(false);
        };
        self.etcd_client = Some(crate::client::new_connect(current_profile).await?);

        Ok(true)
    }

    pub async fn get_client(&mut self) -> Result<&mut etcd_client::Client, String> {
        match self.init_client().await {
            Ok(true) => (),
            Ok(false) => return Err("Could not find current profile".to_string()),
            Err(e) => return Err(e),
        }

        Ok(self
            .etcd_client
            .as_mut()
            .expect("Client should be initialized"))
    }
}
