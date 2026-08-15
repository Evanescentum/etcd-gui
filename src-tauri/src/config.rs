use serde::{Deserialize, Serialize};
use std::{fmt::Display, time::Duration};
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AppConfig {
    pub profiles: Vec<Profile>,
    pub current_profile: Option<String>,
    pub color_theme: ColorTheme,
    #[serde(default = "default_visual_theme")]
    pub visual_theme: String,
    pub font_family_body: Option<String>,
    pub font_family_mono: Option<String>,
    #[serde(default)]
    pub kv_load_method: KvLoadMethod,
    #[serde(default)]
    pub update_channel: UpdateChannel,
    #[serde(default)]
    pub update_check_schedule: UpdateCheckSchedule,
}

fn default_visual_theme() -> String {
    "Default".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, strum::Display)]
pub enum UpdateChannel {
    Stable,
    #[default] // XXX: Default to Beta for now since Stable doesn't have releases yet
    Beta,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub enum KvLoadMethod {
    #[default]
    Lazy,
    Full,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub enum UpdateCheckSchedule {
    Never,
    #[default]
    Daily,
    Weekly,
    Monthly,
}

impl UpdateCheckSchedule {
    pub fn interval_duration(&self) -> Option<Duration> {
        match self {
            Self::Never => None,
            Self::Daily => Some(Duration::from_secs(24 * 60 * 60)),
            Self::Weekly => Some(Duration::from_secs(7 * 24 * 60 * 60)),
            Self::Monthly => Some(Duration::from_secs(30 * 24 * 60 * 60)),
        }
    }
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
    // The metric path for the cluster endpoints. By default usually `/metrics`
    #[serde(default = "default_metrics_path")]
    pub metrics_path: Option<String>,
}

fn default_metrics_path() -> Option<String> {
    Some("/metrics".to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone, Hash)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
}

impl Display for Endpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.host, self.port)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub enum ColorTheme {
    Light,
    Dark,
    #[default]
    System,
}

impl AppConfig {
    const CONFIG_FILE_NAME: &'static str = "config.json";

    /// Returns app config path
    pub fn get_config_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
        let path = app_handle
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join(Self::CONFIG_FILE_NAME);
        // Canonicalize to strip UNC prefixes on Windows, but the config file
        // may not exist yet, so fall back to the plain path in that case.
        Ok(dunce::realpath(&path).unwrap_or(path))
    }

    pub fn from_file(path: impl AsRef<std::path::Path>) -> std::io::Result<Self> {
        let path = path.as_ref();
        if path.exists() {
            log::debug!("Loading config from: {}", path.display());
            let file = std::fs::File::open(path)?;
            let reader = std::io::BufReader::new(file);
            let config: AppConfig = serde_json::from_reader(reader)?;
            Ok(config)
        } else {
            log::info!("Config file not found at {}, using default", path.display());
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

impl Profile {
    pub fn fingerprint(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        self.endpoints.hash(&mut hasher);
        self.user.hash(&mut hasher);
        self.timeout_ms.hash(&mut hasher);
        self.connect_timeout_ms.hash(&mut hasher);
        hasher.finish()
    }
}
