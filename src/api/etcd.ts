import { invoke } from '@tauri-apps/api/core';

/**
 * Represents a key-value pair from etcd
 */
export interface EtcdItem {
    key: string;
    value: string;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
    profiles: Profile[];
    current_profile: string | null;
    color_theme: 'Light' | 'Dark' | 'System';
}

export interface Profile {
    name: string;
    endpoints: Array<{
        host: string;
        port: number;
    }>;
    user?: [string, string]; // [username, password] tuple
    timeout_ms?: number;
    connect_timeout_ms?: number;
    locked?: boolean;
}

/**
 * Connect to an etcd cluster with the specified connection info
 */
export async function initializeEtcdClient(): Promise<string> {
    try {
        return await invoke<string>('initialize_etcd_client');
    } catch (error) {
        console.error('Error connecting to etcd:', error);
        throw error;
    }
}

/**
 * Fetch key-value pairs from etcd with the specified prefix
 * @param prefix The key prefix to filter by (default: '/')
 */
export async function fetchEtcdItems(prefix: string = '/'): Promise<EtcdItem[]> {
    try {
        // Call the Rust list_keys command with the specified prefix
        const items = await invoke<EtcdItem[]>('list_keys', { prefix });
        return items;
    } catch (error) {
        console.error('Error fetching etcd items:', error);
        throw error;
    }
}

/**
 * Put a key-value pair into etcd
 * @param key The key to add
 * @param value The value to add
 */
export async function putEtcdItem(key: string, value: string): Promise<void> {
    try {
        await invoke<void>('put_key', { key, value });
    } catch (error) {
        console.error('Error adding etcd item:', error);
        throw error;
    }
}

/**
 * Delete a key from etcd
 * @param key The key to delete
 */
export async function deleteEtcdItem(key: string): Promise<void> {
    try {
        await invoke<void>('delete_key', { key });
    } catch (error) {
        console.error('Error deleting etcd item:', error);
        throw error;
    }
}

/**
 * Get the current application configuration
 */
export async function getConfig(): Promise<AppConfig> {
    try {
        return await invoke<AppConfig>('get_config');
    } catch (error) {
        console.error('Error getting config:', error);
        throw error;
    }
}

/**
 * Update the application configuration
 * @param config The new configuration to set
 */
export async function updateConfig(config: AppConfig): Promise<void> {
    try {
        await invoke<void>('update_config', { config });
    } catch (error) {
        console.error('Error updating config:', error);
        throw error;
    }
}

/**
 * Check if the application configuration file exists
 * @returns True if config file exists, false otherwise
 */
export async function configFileExists(): Promise<boolean> {
    try {
        return await invoke<boolean>('config_file_exists');
    } catch (error) {
        console.error('Error checking config file:', error);
        throw error;
    }
}

/**
 * Get the path to the config file
 * @returns Full path to the configuration file
 */
export async function getConfigFilePath(): Promise<string> {
    try {
        return await invoke<string>('config_file_path');
    } catch (error) {
        console.error('Error getting config file path:', error);
        throw error;
    }
}

/**
 * Open the config file in the default system application
 * This now calls a Rust function instead of using the frontend plugin
 */
export async function openConfigFile(): Promise<void> {
    try {
        await invoke<void>('open_config_file');
    } catch (error) {
        console.error('Error opening config file:', error);
        throw error;
    }
}

/**
 * Open the configuration folder in the default file explorer
 */
export async function openConfigFolder(): Promise<void> {
    try {
        await invoke<void>('open_config_folder');
    } catch (error) {
        console.error('Error opening config folder:', error);
        throw error;
    }
}

/**
 * Test connection to etcd server with provided profile
 * @param profile The profile to test connection with
 * @returns Etcd server version
 */
export async function testConnection(profile: Profile): Promise<string> {
    return await invoke<string>('test_connection', { profile });
}

/**
 * Save a path to the history
 * @param path The path to save
 * @param profileName The current profile name
 */
export async function savePathToHistory(path: string, profileName: string): Promise<string[]> {
    try {
        return await invoke<string[]>('save_path_history', { path, profileName });
    } catch (error) {
        console.error('Error saving path to history:', error);
        throw error;
    }
}

/**
 * Get the path history for a profile
 * @param profileName The profile name to get history for
 * @returns Array of path strings
 */
export async function getPathHistory(profileName: string): Promise<string[]> {
    try {
        return await invoke<string[]>('get_path_history', { profileName });
    } catch (error) {
        console.error('Error getting path history:', error);
        throw error;
    }
}
