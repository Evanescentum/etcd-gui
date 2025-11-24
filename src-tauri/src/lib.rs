mod client;
mod config;
mod core;
mod state;

use serde::Serialize;
use state::AppState;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_log::{Target, TargetKind};
use tokio::sync::Mutex;

/// Initialize the etcd client managed by the application state.
///
/// Returns false if the ```current_profile``` is not pointinng to a valid profile,
/// otherwise returns true.
#[tauri::command]
async fn initialize_etcd_client(state: State<'_, Mutex<AppState>>) -> Result<bool, String> {
    log::info!("Initializing etcd client...");
    let _ = state.lock().await.etcd_client.take(); // Reset the client if it exists
    let res = state.lock().await.init_client().await;
    if let Err(ref e) = res {
        log::error!("Failed to initialize client: {}", e);
    } else {
        log::info!("Etcd client initialized successfully");
    }
    res
}

#[tauri::command]
async fn list_keys(
    prefix: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<client::Item>, String> {
    log::debug!("Listing keys with prefix: {}", prefix);
    // Call the client function with the provided prefix
    let mut state = state.lock().await;
    core::list_keys(&prefix, &mut state).await.map_err(|e| {
        log::error!("Failed to list keys: {}", e);
        e
    })
}

#[tauri::command]
async fn list_keys_only(
    prefix: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<String>, String> {
    log::debug!("Listing keys only with prefix: {}", prefix);
    let mut state = state.lock().await;
    core::list_keys_only(&prefix, &mut state)
        .await
        .map_err(|e| {
            log::error!("Failed to list keys only: {}", e);
            e
        })
}

#[tauri::command]
async fn get_values_in_range(
    start_key: String,
    end_inclusive: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<client::Item>, String> {
    log::debug!("Getting values in range: {} ~ {}", start_key, end_inclusive);
    let mut state = state.lock().await;
    core::get_values_in_range(&start_key, &end_inclusive, &mut state)
        .await
        .map_err(|e| {
            log::error!("Failed to get values in range: {}", e);
            e
        })
}

#[tauri::command]
async fn put_key(
    key: String,
    value: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    log::info!("Putting key: {}", key);
    let mut state = state.lock().await;
    state.app_config.ensure_current_profile_unlocked()?;
    core::put_key(&key, &value, &mut state).await.map_err(|e| {
        log::error!("Failed to put key {}: {}", key, e);
        e
    })
}

#[tauri::command]
async fn delete_key(key: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    log::info!("Deleting key: {}", key);
    let mut state = state.lock().await;
    state.app_config.ensure_current_profile_unlocked()?;
    core::delete_key(&key, &mut state).await.map_err(|e| {
        log::error!("Failed to delete key {}: {}", key, e);
        e
    })
}

#[tauri::command]
async fn get_cluster_info(state: State<'_, Mutex<AppState>>) -> Result<ClusterInfo, String> {
    log::debug!("Getting cluster info");
    let mut state = state.lock().await;

    // Get cluster members
    let members = core::get_cluster_members(&mut state).await.map_err(|e| {
        log::error!("Failed to get cluster members: {}", e);
        e
    })?;

    // Get cluster status
    let status = core::get_cluster_status(&mut state).await.map_err(|e| {
        log::error!("Failed to get cluster status: {}", e);
        e
    })?;

    // Convert members to serializable format
    let members_info: Vec<MemberInfo> = members
        .iter()
        .map(|m| MemberInfo {
            id: m.id(),
            name: m.name().to_string(),
            peer_urls: m.peer_urls().to_vec(),
            client_urls: m.client_urls().to_vec(),
        })
        .collect();

    Ok(ClusterInfo {
        cluster_id: status.header().unwrap().cluster_id(),
        member_id: status.header().unwrap().member_id(),
        version: status.version().to_string(),
        db_size: status.db_size(),
        raft_index: status.raft_index(),
        raft_term: status.raft_term(),
        leader: status.leader(),
        members: members_info,
    })
}

#[derive(Serialize)]
struct MemberInfo {
    id: u64,
    name: String,
    peer_urls: Vec<String>,
    client_urls: Vec<String>,
}

#[derive(Serialize)]
struct ClusterInfo {
    cluster_id: u64,
    member_id: u64,
    version: String,
    db_size: i64,
    raft_index: u64,
    raft_term: u64,
    leader: u64,
    members: Vec<MemberInfo>,
}

#[tauri::command]
async fn get_config(state: State<'_, Mutex<AppState>>) -> Result<config::AppConfig, String> {
    let app_state = state.lock().await;
    // Return a clone of the config
    Ok(app_state.app_config.clone())
}

#[tauri::command]
async fn update_config(
    config: config::AppConfig,
    state: State<'_, Mutex<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("Updating configuration...");
    let mut app_state = state.lock().await;

    // Save config to disk
    let path = config::AppConfig::get_config_path(&app_handle)?;
    let file = match File::create(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Create parent directory only when the path doesn't exist, then retry
            let parent = path.parent().ok_or(format!(
                "Failed to determine parent directory for config path: {:?}",
                &path
            ))?;

            log::info!("Config directory not found at {:?}, creating...", parent);

            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Failed to create config directory: {}", err))?;
            File::create(&path).map_err(|err| {
                format!(
                    "Failed to create config file after creating directory: {}",
                    err
                )
            })?
        }
        Err(e) => {
            log::error!("Failed to create config file at {:?}: {}", &path, e);
            return Err(format!("Failed to create config file: {}", e));
        }
    };

    serde_json::to_writer_pretty(file, &config)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Check if current profile changed
    let should_reconnect = app_state.app_config.current_profile != config.current_profile;

    // Update in-memory config
    app_state.app_config = config; // Update in-memory config with the new settings

    // Re-initialize client if profile changed
    if should_reconnect {
        log::info!("Current profile changed, resetting client");
        app_state.etcd_client = None; // Reset the client
    }

    log::info!("Configuration updated successfully");
    Ok(())
}

#[tauri::command]
async fn test_connection(profile: config::Profile) -> Result<String, String> {
    log::info!("Testing connection for profile: {}", profile.name);
    // Try to connect using the profile
    let mut client = client::new_connect(&profile).await?;
    client
        .status()
        .await
        .map(|status| status.version().to_string())
        .map_err(|e| {
            log::error!("Connection test failed: {}", e);
            e.to_string()
        })
}

#[tauri::command]
async fn config_file_exists(app_handle: tauri::AppHandle) -> Result<bool, String> {
    // Check if the config file exists
    Ok(config::AppConfig::get_config_path(&app_handle)?.exists())
}

#[tauri::command]
async fn config_file_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Return the config file path
    Ok(config::AppConfig::get_config_path(&app_handle)?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn open_config_file(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get the config file path
    let path = config::AppConfig::get_config_path(&app_handle)?;

    // Open the file with the default application
    open::that(path).map_err(|e| format!("Failed to open config file: {}", e))
}

#[tauri::command]
async fn open_config_folder(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get the config file path
    let path = config::AppConfig::get_config_path(&app_handle)?;

    // Get the parent directory
    let folder_path = path.parent().ok_or("Failed to get config folder path")?;

    // Open the folder with the default application
    open::that(folder_path).map_err(|e| format!("Failed to open config folder: {}", e))
}

#[tauri::command]
async fn open_devtools(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get the main webview window
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Failed to get main webview window")?;

    // Open the developer tools
    window.open_devtools();

    Ok(())
}

#[tauri::command]
async fn save_path_history(
    path: String,
    profile_name: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    log::debug!("Saving path history for profile {}: {}", profile_name, path);
    let history_path = get_history_file_path(&app_handle)?;

    // Read existing history map
    let mut history_map: HashMap<String, Vec<String>> = match read_history_file(&history_path) {
        Ok(h) => h,
        Err(_) => HashMap::new(),
    };

    // Get or create history for this profile
    let history = history_map
        .entry(profile_name.clone())
        .or_insert_with(Vec::new);

    // Don't add duplicates, remove if exists and add to front
    history.retain(|p| p != &path);
    history.insert(0, path);

    // Keep only the most recent 20 entries for this profile
    while history.len() > 20 {
        history.pop();
    }

    let res = history.clone();

    // Write back to file
    let mut file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .create(true)
        .open(&history_path)
        .map_err(|e| {
            log::error!("Failed to open history file: {}", e);
            format!("Failed to open history file: {e}")
        })?;

    let content = serde_json::to_string(&history_map).map_err(|e| {
        log::error!("Failed to serialize history: {}", e);
        format!("Failed to serialize history: {e}")
    })?;

    file.write_all(content.as_bytes()).map_err(|e| {
        log::error!("Failed to write history: {}", e);
        format!("Failed to write history: {e}")
    })?;

    Ok(res)
}

#[tauri::command]
async fn get_path_history(
    profile_name: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let history_path = get_history_file_path(&app_handle)?;

    match read_history_file(&history_path) {
        Ok(history_map) => Ok(history_map.get(&profile_name).cloned().unwrap_or_default()),
        Err(_) => Ok(Vec::new()),
    }
}

fn get_history_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    // Create directory if it doesn't exist
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    }

    Ok(app_dir.join("path_history.json"))
}

fn read_history_file(path: &PathBuf) -> Result<HashMap<String, Vec<String>>, std::io::Error> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;

    serde_json::from_str(&contents)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

#[tauri::command]
async fn get_system_fonts() -> Result<Vec<String>, String> {
    log::debug!("Getting system fonts");
    let source = font_kit::source::SystemSource::new();
    match source.all_families() {
        Ok(mut fonts) => {
            // Deduplicate and sort
            fonts.sort();
            fonts.dedup();

            Ok(fonts)
        }
        Err(e) => {
            log::error!("Failed to get system fonts: {:?}", e);
            Err(format!("Failed to get system fonts: {:?}", e))
        }
    }
}

#[tauri::command]
async fn get_key_at_revision(
    key: String,
    revision: i64,
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<client::Item>, String> {
    log::debug!("Getting key {} at revision {}", key, revision);
    let mut state = state.lock().await;
    core::get_key_at_revision(&key, revision, &mut state)
        .await
        .map_err(|e| {
            log::error!("Failed to get key at revision: {}", e);
            e
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .targets([
                    Target::new(TargetKind::Webview),
                    Target::new(TargetKind::LogDir {
                        file_name: "app".to_string().into(),
                    }),
                ])
                .max_file_size(1024 * 1024) // 1 MB
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(20))
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            initialize_etcd_client,
            list_keys,
            list_keys_only,
            get_values_in_range,
            put_key,
            delete_key,
            get_cluster_info,
            get_config,
            update_config,
            test_connection,
            config_file_exists,
            config_file_path,
            open_config_file,
            open_config_folder,
            open_devtools,
            save_path_history,
            get_path_history,
            get_system_fonts,
            get_key_at_revision
        ])
        .setup(|app| {
            app.manage(tokio::sync::Mutex::new(AppState::new(app.handle())?));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
