import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    EtcdItem,
    type DashboardQueryProgress,
    type DashboardQueryLoadMode,
    getClusterInfo,
    type ClusterInfo,
    fetchMetrics,
    type Endpoint,
    type ParsedMetricFamily,
    streamDashboardQuery,
} from "../api/etcd";

export const etcdQueryKeys = {
    clusterInfo: (profileName: string) => ["cluster-info", profileName] as const,
    metrics: (profileName: string, endpoint: Endpoint | null) => ["metrics", profileName, endpoint?.host ?? null, endpoint?.port ?? null] as const,
};

export interface DashboardQueryResult {
    data: EtcdItem[];
    total: number | null;
    progress: DashboardQueryProgress | null;
    loadError: string | null;
    isPageLoading: boolean;
    isSourceLoading: boolean;
    isPageRefreshing: boolean;
    isStreaming: boolean;
    isTotalLoading: boolean;
    revision: number | null;
    /**
     * Drops the pinned revision for the current source and reloads from the latest revision.
     */
    refetch: () => Promise<void>;
}

interface DashboardViewState {
    sourceKey: string;
    items: EtcdItem[];
    total: number | null;
    progress: DashboardQueryProgress | null;
    hasExactTotal: boolean;
    pageReady: boolean;
    isComplete: boolean;
    loadError: string | null;
    loadingScope: "source" | "page" | null;
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEmptyDashboardView(sourceKey = ""): DashboardViewState {
    return {
        sourceKey,
        items: [],
        total: null,
        progress: null,
        hasExactTotal: false,
        pageReady: false,
        isComplete: false,
        loadError: null,
        loadingScope: null,
    };
}

/**
 * Streams dashboard items while pinning each source view to a resolved backend revision.
 *
 * Call `refetch` after a write to discard that revision pin and refresh against the
 * newest revision instead of asking the backend to invalidate historical snapshots.
 */
export function useDashboardItemsQuery({ enabled, keyPrefix, currentProfileName, searchQuery, currentPage, pageSize, refreshNonce, loadMode }: {
    enabled: boolean;
    keyPrefix: string;
    currentProfileName: string;
    searchQuery: string;
    currentPage: number;
    pageSize: number;
    refreshNonce: number;
    loadMode: DashboardQueryLoadMode;
}): DashboardQueryResult {
    const [view, setView] = useState<DashboardViewState>(() => createEmptyDashboardView());
    const [showDelayedPageRefresh, setShowDelayedPageRefresh] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [pageRefreshRequestNonce, setPageRefreshRequestNonce] = useState(0);
    const [revision, setRevision] = useState<number | null>(null);
    const activeRequestIdRef = useRef("");
    // The dashboard stays on a resolved revision until the caller explicitly asks for latest data.
    const pinnedRevisionsRef = useRef<Record<string, number>>({});
    const viewRef = useRef(view);
    const sourceKey = useMemo(
        () => JSON.stringify([currentProfileName, keyPrefix, searchQuery, loadMode, refreshNonce]),
        [currentProfileName, keyPrefix, searchQuery, loadMode, refreshNonce],
    );
    const revisionSourceKey = useMemo(
        () => JSON.stringify([currentProfileName, keyPrefix, loadMode, refreshNonce]),
        [currentProfileName, keyPrefix, loadMode, refreshNonce],
    );

    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    useEffect(() => {
        if (!enabled) {
            setIsFetching(false);
            return;
        }

        const requestId = generateRequestId();
        const previousView = viewRef.current;
        const sameSource = previousView.sourceKey === sourceKey;

        activeRequestIdRef.current = requestId;
        setPageRefreshRequestNonce((current) => current + 1);
        setIsFetching(true);
        setView({
            ...createEmptyDashboardView(sourceKey),
            items: sameSource ? previousView.items : [],
            total: sameSource ? previousView.total : null,
            hasExactTotal: sameSource ? previousView.hasExactTotal : false,
            pageReady: sameSource ? previousView.pageReady : false,
            loadingScope: sameSource ? "page" : "source",
        });

        void streamDashboardQuery({
            prefix: keyPrefix,
            search: searchQuery,
            currentPage,
            pageSize,
            loadMode,
            revision: pinnedRevisionsRef.current[revisionSourceKey] ?? null,
        }, {
            onStarted: ({ data }) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                pinnedRevisionsRef.current[revisionSourceKey] = data.resolvedRevision;
                setRevision(data.resolvedRevision);

                setView((current) => ({
                    ...current,
                    sourceKey,
                    total: sameSource && data.total === null ? current.total : data.total,
                    progress: {
                        scanned: 0,
                        matched: 0,
                        sourceTotal: data.sourceTotal,
                    },
                    hasExactTotal: sameSource && data.total === null ? current.hasExactTotal : data.total !== null,
                    loadError: null,
                }));
            },
            onPageChunk: ({ data }) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                setView((current) => ({
                    ...current,
                    sourceKey,
                    items: data.items,
                    pageReady: true,
                    loadError: null,
                    loadingScope: null,
                }));
            },
            onProgress: ({ data }) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                setView((current) => ({
                    ...current,
                    sourceKey,
                    progress: data,
                }));
            },
            onCompleted: ({ data }) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                setView((current) => ({
                    ...current,
                    sourceKey,
                    total: data.total,
                    progress: current.progress ? {
                        ...current.progress,
                        scanned: current.progress.sourceTotal,
                        matched: data.total,
                    } : current.progress,
                    hasExactTotal: true,
                    pageReady: true,
                    isComplete: true,
                    loadingScope: null,
                }));
            },
            onError: ({ data }) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                setView((current) => ({
                    ...current,
                    sourceKey,
                    loadError: data.message,
                    isComplete: true,
                    loadingScope: null,
                }));
            },
        })
            .catch((error) => {
                if (activeRequestIdRef.current !== requestId) {
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setView((current) => ({
                    ...current,
                    sourceKey,
                    loadError: message,
                    isComplete: true,
                    loadingScope: null,
                }));
            })
            .finally(() => {
                if (activeRequestIdRef.current === requestId) {
                    setIsFetching(false);
                }
            });
    }, [
        currentPage,
        currentProfileName,
        enabled,
        keyPrefix,
        loadMode,
        pageSize,
        refreshNonce,
        reloadNonce,
        revisionSourceKey,
        searchQuery,
        sourceKey,
    ]);

    const isSourceLoading = enabled && !view.loadError && !view.pageReady && view.loadingScope === "source";
    const rawPageRefreshing = enabled && !view.loadError && view.loadingScope === "page" && isFetching;

    useEffect(() => {
        if (!rawPageRefreshing) {
            setShowDelayedPageRefresh(false);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setShowDelayedPageRefresh(true);
        }, 800);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [pageRefreshRequestNonce, rawPageRefreshing]);

    const isPageRefreshing = rawPageRefreshing && showDelayedPageRefresh;
    const isPageLoading = enabled && !view.loadError && (!view.pageReady || isPageRefreshing);

    return {
        data: view.pageReady ? view.items : [],
        total: view.total,
        progress: view.progress,
        loadError: view.loadError,
        isPageLoading,
        isSourceLoading,
        isPageRefreshing,
        isStreaming: isFetching && !view.isComplete,
        isTotalLoading: !view.hasExactTotal && !!searchQuery && !view.isComplete,
        revision,
        refetch: async () => {
            delete pinnedRevisionsRef.current[revisionSourceKey];
            setRevision(null);
            setReloadNonce((current) => current + 1);
        },
    };
}

export function useClusterInfoQuery({ currentProfileName, configLoading }: {
    currentProfileName: string;
    configLoading: boolean;
}): UseQueryResult<ClusterInfo, string> {
    return useQuery({
        queryKey: etcdQueryKeys.clusterInfo(currentProfileName),
        queryFn: async () => await getClusterInfo(),
        staleTime: 1000 * 60,
        enabled: !configLoading && !!currentProfileName,
    });
}

export function useMetricsQuery({ currentProfileName, configLoading, endpoint, isActive, autoRefresh, intervalMs = 10000 }: {
    currentProfileName: string;
    configLoading: boolean;
    endpoint: Endpoint | null;
    isActive: boolean;
    autoRefresh: boolean;
    intervalMs?: number;
}): UseQueryResult<ParsedMetricFamily[], string> {
    return useQuery({
        queryKey: etcdQueryKeys.metrics(currentProfileName, endpoint),
        queryFn: async () => {
            if (!endpoint) {
                throw new Error("Metrics endpoint is required");
            }

            return await fetchMetrics(endpoint);
        },
        refetchInterval: isActive && autoRefresh ? intervalMs : false,
        enabled: isActive && !configLoading && !!currentProfileName && !!endpoint,
    });
}
