use etcd_client::{Client, Error};

use crate::client::is_auth_token_expired;
use crate::config;
use crate::query_manager::QueryManager;

/// Shared Tauri application state.
#[derive(Default)]
pub struct AppState {
    pub app_config: config::AppConfig,

    pub etcd_client: Option<etcd_client::Client>,
    /// Owns dashboard query sessions and revision-scoped snapshot caches.
    pub query_manager: QueryManager,
}

impl AppState {
    pub fn new(app_handle: &tauri::AppHandle) -> std::io::Result<Self> {
        let app_config = config::AppConfig::from_file(
            config::AppConfig::get_config_path(app_handle).map_err(std::io::Error::other)?,
        )?;
        Ok(AppState {
            app_config,
            etcd_client: None,
            query_manager: QueryManager::default(),
        })
    }

    pub async fn init_client(&mut self) -> Result<bool, String> {
        if self.etcd_client.is_some() {
            return Ok(true);
        }

        let Some(current_profile) = self.app_config.get_current_profile() else {
            return Ok(false);
        };
        self.etcd_client = Some(crate::client::connect(current_profile).await?);

        Ok(true)
    }

    pub async fn get_client(&mut self) -> Result<etcd_client::Client, String> {
        match self.init_client().await {
            Ok(true) => (),
            Ok(false) => return Err("Could not find current profile".to_string()),
            Err(e) => return Err(e),
        }

        Ok(self
            .etcd_client
            .as_ref()
            .expect("Client should be initialized after successful init_client")
            .clone())
    }

    pub async fn perform_op<T, F>(&mut self, mut f: F) -> Result<T, String>
    where
        // HACK:for now async fn traits dosn't support constraints on the output type, so we have to use a workaround
        // see: https://users.rust-lang.org/t/implementation-of-send-is-not-general-enough-for-asyncfnmut/126215/2
        F: async_fn_traits::AsyncFnMut1<Client, Output = Result<T, Error>>,
    {
        let client = self.get_client().await?;
        let res = f(client).await;

        if !is_auth_token_expired(&res) {
            return res.map_err(|e| e.to_string());
        }
        log::warn!("Refreshing client connection...");
        self.etcd_client = None;
        let client = self.get_client().await?;
        f(client).await.map_err(|e| e.to_string())
    }
}
