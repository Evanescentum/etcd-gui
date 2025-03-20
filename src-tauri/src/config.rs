use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub profiles: Vec<Profile>,
    pub current_profile: Option<String>,
    pub color_theme: ColorTheme,
}

// A profile defines the connection information for a client to connect to etcd
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Profile {
    pub name: String,
    pub endpoints: Vec<Endpoint>,
    pub user: Option<(String, String)>,
    pub timeout_ms: Option<u64>,
    pub connect_timeout_ms: Option<u64>,
    pub locked: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ColorTheme {
    Light,
    Dark,
    System,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            profiles: vec![],
            current_profile: None,
            color_theme: ColorTheme::System,
        }
    }
}

impl AppConfig {
    const CONFIG_FILE_NAME: &'static str = "config.json";

    /// Returns app config path
    pub fn get_config_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
        app_handle
            .path()
            .app_config_dir()
            .map(|path| path.join(Self::CONFIG_FILE_NAME).to_owned())
            .map_err(|e| e.to_string())
    }

    pub fn from_file(path: impl AsRef<std::path::Path>) -> std::io::Result<Self> {
        let path = path.as_ref();
        if path.exists() {
            let file = std::fs::File::open(path)?;
            let reader = std::io::BufReader::new(file);
            let config: AppConfig = serde_json::from_reader(reader)?;
            Ok(config)
        } else {
            Ok(AppConfig::default())
        }
    }

    pub fn get_current_profile(&self) -> Option<&Profile> {
        self.current_profile
            .as_ref()
            .and_then(|name| self.profiles.iter().find(|p| p.name == *name))
    }

    /// Used by commands that may change etcd server data.
    ///
    /// Return Err if the current profile is locked.
    pub fn ensure_current_profile_unlocked(&self) -> Result<(), String> {
        let current_profile = self
            .get_current_profile()
            .ok_or_else(|| "No current profile set".to_string())?;
        if let Some(true) = current_profile.locked {
            Err("Current profile is locked".to_string())
        } else {
            Ok(())
        }
    }
}
