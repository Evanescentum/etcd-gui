import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Represents a key-value pair from etcd
 */
export interface EtcdItem {
    key: string;
    value: string;
    version: number;
    create_revision: number;
    mod_revision: number;
    lease: number;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
    profiles: Profile[];
    current_profile: string | null;
    color_theme: 'Light' | 'Dark' | 'System';
    font_family_body?: string;
    font_family_mono?: string;
    kv_load_method: "Lazy" | "Full";
    update_channel: UpdateChannel;
    update_check_schedule: UpdateCheckSchedule;
    log_file_path?: string;
}

export type UpdateChannel = "Stable" | "Beta";
export type UpdateCheckSchedule = "Never" | "Daily" | "Weekly" | "Monthly";

export interface ReleaseInfo {
    tag_name: string;
    version: string;
    name: string;
    published_at: string | null;
    body: string;
    html_url: string;
    prerelease: boolean;
}

export interface UpdateCheckResult {
    channel: UpdateChannel;
    current_version: string;
    update_available: boolean;
    release: ReleaseInfo;
}

export type UpdateCheckTrigger = "automatic" | "manual";

export interface UpdateCheckEvent {
    trigger: UpdateCheckTrigger;
    result?: UpdateCheckResult;
    error?: string;
}

export interface Endpoint {
    host: string;
    port: number;
}

export async function checkUpdate(channel: UpdateChannel): Promise<UpdateCheckResult> {
    try {
        return await invoke<UpdateCheckResult>('check_update', { channel });
    } catch (error) {
        console.error('Error checking update:', error);
        throw error;
    }
}

export async function triggerUpdateCheck(): Promise<void> {
    try {
        await invoke<void>('trigger_update_check');
    } catch (error) {
        console.error('Error triggering update check:', error);
        throw error;
    }
}

export async function listenUpdateCheckEvents(
    handler: (payload: UpdateCheckEvent) => void,
): Promise<() => void> {
    return listen<UpdateCheckEvent>('update-check', (event) => {
        handler(event.payload);
    });
}

export interface Profile {
    name: string;
    endpoints: Endpoint[];
    user?: [string, string]; // [username, password] tuple
    timeout_ms?: number;
    connect_timeout_ms?: number;
    locked?: boolean;
    metrics_path?: string;
}

export interface ParsedMetricSample {
    value: string;
    labels?: Record<string, string>;
}

export interface ParsedMetricFamily {
    name: string;
    help: string;
    type: "COUNTER" | "GAUGE" | "HISTOGRAM" | "SUMMARY" | "UNTYPED";
    metrics: ParsedMetricSample[];
}

/**
 * Connect to an etcd cluster with the specified connection info
 */
export async function initializeEtcdClient(): Promise<boolean> {
    try {
        return await invoke<boolean>('initialize_etcd_client');
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
        // Call the Rust list_items command with the specified prefix
        const items = await invoke<EtcdItem[]>('list_items', { prefix });
        return items;
    } catch (error) {
        console.error('Error fetching etcd items:', error);
        throw error;
    }
}

/**
 * Fetch only keys by prefix (no values), for counts and pagination
 */
export async function fetchEtcdKeysOnly(prefix: string = '/'): Promise<string[]> {
    try {
        return await invoke<string[]>('list_keys_only', { prefix });
    } catch (error) {
        console.error('Error fetching etcd keys only:', error);
        throw error;
    }
}

/**
 * Fetch values in range [startKey, endKey] inclusive
 */
export async function fetchValuesInRange(startKey: string, endKey: string): Promise<EtcdItem[]> {
    try {
        return await invoke<EtcdItem[]>('get_values_in_range', { startKey: startKey, endInclusive: endKey });
    } catch (error) {
        console.error('Error fetching values in range:', error);
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
 * Fetch Prometheus format metrics from etcd
 */
export async function fetchMetrics(endpoint: Endpoint): Promise<ParsedMetricFamily[]> {
    try {
        return await invoke<ParsedMetricFamily[]>('fetch_metrics', { endpoint });
    } catch (error) {
        console.error('Error fetching metrics:', error);
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

export async function getDefaultConfig(): Promise<AppConfig> {
    try {
        return await invoke<AppConfig>('get_default_config');
    } catch (error) {
        console.error('Error getting default config:', error);
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
 * Open the log folder in the default file explorer
 */
export async function openLogFolder(): Promise<void> {
    try {
        await invoke<void>('open_log_folder');
    } catch (error) {
        console.error('Error opening log folder:', error);
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

/**
 * Delete a path from the history
 * @param path The path to delete
 * @param profileName The current profile name
 * @returns Updated array of path strings
 */
export async function deletePathFromHistory(path: string, profileName: string): Promise<string[]> {
    try {
        return await invoke<string[]>('delete_path_history', { path, profileName });
    } catch (error) {
        console.error('Error deleting path from history:', error);
        throw error;
    }
}

/**
 * Open the webview developer tools/console
 */
export async function openDevtools(): Promise<void> {
    try {
        return await invoke<void>('open_devtools');
    } catch (error) {
        console.error('Error opening developer tools:', error);
        throw error;
    }
}

/**
 * Member information in the cluster
 */
export interface MemberInfo {
    id: number;
    name: string;
    peer_urls: string[];
    client_urls: string[];
}

/**
 * Cluster information including members and status
 */
export interface ClusterInfo {
    cluster_id: number;
    member_id: number;
    version: string;
    db_size: number;
    raft_index: number;
    raft_term: number;
    leader: number;
    members: MemberInfo[];
}

/**
 * Get cluster information including members and status
 */
export async function getClusterInfo(): Promise<ClusterInfo> {
    try {
        return await invoke<ClusterInfo>('get_cluster_info');
    } catch (error) {
        console.error('Error getting cluster info:', error);
        throw error;
    }
}

/**
 * Get list of available system fonts
 */
export async function getSystemFonts(): Promise<string[]> {
    try {
        return await invoke<string[]>('get_system_fonts');
    } catch (error) {
        console.error('Error getting system fonts:', error);
        return [];
    }
}

/**
 * Get a key's value at a specific revision
 * @param key The key to fetch
 * @param revision The revision to fetch at
 */
export async function getKeyAtRevision(key: string, revision: number): Promise<EtcdItem | null> {
    try {
        return await invoke<EtcdItem | null>('get_key_at_revision', { key, revision });
    } catch (error) {
        console.error('Error getting key at revision:', error);
        throw error;
    }
}

/**
 * Format a Unix timestamp (in milliseconds) to ISO 8601 strings
 * Returns both UTC and local time representations
 * Uses Rust backend for reliable formatting with chrono library
 * @param timestamp Unix timestamp in milliseconds
 */
export async function formatTimestamp(timestamp: number): Promise<{ utc: string; local: string }> {
    try {
        return await invoke<{ utc: string; local: string }>('format_timestamp', {
            timestampMs: timestamp,
        });
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        throw error;
    }
}
