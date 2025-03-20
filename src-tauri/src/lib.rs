mod client;
mod config;
mod core;
mod state;

use client::should_refresh;
use state::AppState;
use tauri::{Manager, State};
use tokio::sync::Mutex;

// Initialize the etcd client when the application starts.
//
// Empty string is returned if no profile is found.
#[tauri::command]
async fn initialize_etcd_client(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let _ = state.lock().await.etcd_client.take(); // Reset the client if it exists
    state.lock().await.init_client().await.map(|has_profile| {
        if has_profile {
            format!("Connected successfully")
        } else {
            Default::default()
        }
    })
}

#[tauri::command]
async fn list_keys(
    prefix: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<client::Item>, String> {
    // Call the client function with the provided prefix
    let mut state = state.lock().await;
    let mut res = core::list_keys(&prefix, state.get_client().await?).await;
    if let Some(_) = state.etcd_client.take_if(|_| should_refresh(&res)) {
        res = core::list_keys(&prefix, state.get_client().await?).await;
    }

    res.map_err(|e| e.to_string())
}

#[tauri::command]
async fn put_key(
    key: String,
    value: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.app_config.ensure_current_profile_unlocked()?;
    let mut res = core::put_key(&key, &value, state.get_client().await?).await;
    if let Some(_) = state.etcd_client.take_if(|_| should_refresh(&res)) {
        res = core::put_key(&key, &value, state.get_client().await?).await;
    }

    res.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_key(key: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut state = state.lock().await;
    state.app_config.ensure_current_profile_unlocked()?;
    let mut res = core::delete_key(&key, state.get_client().await?).await;
    if let Some(_) = state.etcd_client.take_if(|_| should_refresh(&res)) {
        res = core::delete_key(&key, state.get_client().await?).await;
    }

    res.map_err(|e| e.to_string())
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
    let mut app_state = state.lock().await;

    // Save config to disk
    let file = std::fs::File::create(config::AppConfig::get_config_path(&app_handle)?)
        .inspect_err(|_| {
            println!(
                "Failed to create config file at {:?}",
                config::AppConfig::get_config_path(&app_handle)
            );
        })
        .map_err(|e| format!("Failed to create config file: {}", e))?;

    serde_json::to_writer_pretty(file, &config)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Check if current profile changed
    let should_reconnect = app_state.app_config.current_profile != config.current_profile;

    // Update in-memory config
    app_state.app_config = config; // Update in-memory config with the new settings

    // Re-initialize client if profile changed
    if should_reconnect {
        app_state.etcd_client = None; // Reset the client
    }

    Ok(())
}

#[tauri::command]
async fn test_connection(profile: config::Profile) -> Result<String, String> {
    // Try to connect using the profile
    let mut client = client::new_connect(&profile).await?;
    client
        .status()
        .await
        .map(|status| status.version().to_string())
        .map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            initialize_etcd_client,
            list_keys,
            put_key,
            delete_key,
            get_config,
            update_config,
            test_connection,
            config_file_exists,
            config_file_path,
            open_config_file // Add the new command to the handler
        ])
        .setup(|app| {
            app.manage(tokio::sync::Mutex::new(AppState::new(app.handle())?));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
