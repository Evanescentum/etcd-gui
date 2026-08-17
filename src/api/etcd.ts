import { Channel, invoke } from '@tauri-apps/api/core';
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

export type DashboardQueryLoadMode = "Lazy" | "Full";

export interface DashboardQueryRequest {
    prefix: string;
    search: string;
    currentPage: number;
    pageSize: number;
    loadMode: DashboardQueryLoadMode;
    revision: number | null;
}

export interface DashboardQueryProgress {
    scanned: number;
    matched: number;
    sourceTotal: number;
}

export type DashboardQueryEvent =
    | {
        event: 'started';
        data: {
            resolvedRevision: number;
            total: number | null;
            sourceTotal: number;
        };
    }
    | {
        event: 'pageChunk';
        data: {
            items: EtcdItem[];
        };
    }
    | {
        event: 'progress';
        data: DashboardQueryProgress;
    }
    | {
        event: 'completed';
        data: {
            total: number;
        };
    }
    | {
        event: 'error';
        data: {
            message: string;
        };
    };

interface DashboardQueryHandlers {
    onStarted?: (event: Extract<DashboardQueryEvent, { event: 'started' }>) => void;
    onPageChunk?: (event: Extract<DashboardQueryEvent, { event: 'pageChunk' }>) => void;
    onProgress?: (event: Extract<DashboardQueryEvent, { event: 'progress' }>) => void;
    onCompleted?: (event: Extract<DashboardQueryEvent, { event: 'completed' }>) => void;
    onError?: (event: Extract<DashboardQueryEvent, { event: 'error' }>) => void;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
    profiles: Profile[];
    current_profile: string | null;
    color_theme: 'Light' | 'Dark' | 'System';
    visual_theme: string;
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

export interface AutoUpdateCheckEvent {
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

export async function listenAutoUpdateCheckEvents(
    handler: (payload: AutoUpdateCheckEvent) => void,
): Promise<() => void> {
    return listen<AutoUpdateCheckEvent>('update-check', (event) => {
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
export async function initializeClient(): Promise<boolean> {
    try {
        return await invoke<boolean>('initialize_etcd_client');
    } catch (error) {
        console.error('Error connecting to etcd:', error);
        throw error;
    }
}


export async function streamDashboardQuery(
    query: DashboardQueryRequest,
    handlers: DashboardQueryHandlers,
): Promise<void> {
    const onEvent = new Channel<DashboardQueryEvent>();
    let resolveCompletion!: () => void;
    let rejectCompletion!: (error: unknown) => void;

    const completion = new Promise<void>((resolve, reject) => {
        let settled = false;

        const resolveOnce = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };

        const rejectOnce = (error: unknown) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        resolveCompletion = resolveOnce;
        rejectCompletion = rejectOnce;

        onEvent.onmessage = (message) => {
            if (message.event === 'started') {
                handlers.onStarted?.(message);
                return;
            }

            if (message.event === 'pageChunk') {
                handlers.onPageChunk?.(message);
                return;
            }

            if (message.event === 'progress') {
                handlers.onProgress?.(message);
                return;
            }

            if (message.event === 'completed') {
                handlers.onCompleted?.(message);
                resolveOnce();
                return;
            }

            handlers.onError?.(message);
            rejectOnce(new Error(message.data.message));
        };
    });

    try {
        await Promise.all([
            invoke<void>('start_dashboard_query', { query, onEvent }).then(() => {
                resolveCompletion();
            }).catch((error) => {
                rejectCompletion(error);
                throw error;
            }),
            completion,
        ]);
    } catch (error) {
        console.error('Error streaming dashboard query:', error);
        throw error;
    }
}

/**
 * Fetch values in range [startKey, endKey] inclusive
 */
/**
 * Put a key-value pair into etcd
 * @param key The key to add
 * @param value The value to add
 */
export async function putKey(key: string, value: string): Promise<void> {
    try {
        await invoke<void>('put_key', { key, value });
    } catch (error) {
        console.error('Error adding etcd item:', error);
        throw error;
    }
}

/**
 * Update a key only if it has not changed since it was loaded. If the key name
 * changes, the old key is atomically moved without overwriting an existing key.
 */
export async function editKey(
    originalKey: string,
    key: string,
    value: string,
    expectedModRevision: number,
): Promise<void> {
    try {
        await invoke<void>('edit_key', { originalKey, key, value, expectedModRevision });
    } catch (error) {
        console.error('Error editing etcd item:', error);
        throw error;
    }
}

/**
 * Delete a key from etcd
 * @param key The key to delete
 */
export async function deleteKey(key: string): Promise<void> {
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
