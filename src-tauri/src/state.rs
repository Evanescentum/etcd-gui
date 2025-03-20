use crate::config;

pub struct AppState {
    pub app_config: config::AppConfig,

    pub etcd_client: Option<etcd_client::Client>,
}

impl AppState {
    pub fn new(app_handle: &tauri::AppHandle) -> std::io::Result<Self> {
        let app_config = config::AppConfig::from_file(
            config::AppConfig::get_config_path(app_handle).map_err(|e| std::io::Error::other(e))?,
        )?;
        Ok(AppState {
            app_config,
            etcd_client: None,
        })
    }

    pub async fn init_client(&mut self) -> Result<bool, String> {
        if self.etcd_client.is_some() {
            return Ok(true);
        }

        let Some(current_profile) = self.app_config.get_current_profile() else {
            return Ok(false);
        };
        self.etcd_client = Some(crate::client::new_connect(&current_profile).await?);

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

impl Default for AppState {
    fn default() -> Self {
        AppState {
            app_config: config::AppConfig::default(),
            etcd_client: None,
        }
    }
}
