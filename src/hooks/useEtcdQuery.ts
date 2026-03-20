import { useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import { EtcdItem, fetchEtcdItems, fetchEtcdKeysOnly, fetchValuesInRange, getClusterInfo, type ClusterInfo, fetchMetrics, type Endpoint, type ParsedMetricFamily } from "../api/etcd";
import { useMemo } from "react";

export const etcdQueryKeys = {
    kvRoot: ["etcd-kv"] as const,
    kvProfile: (profileName: string) => [...etcdQueryKeys.kvRoot, profileName] as const,
    fullItems: (profileName: string, keyPrefix: string) => [...etcdQueryKeys.kvProfile(profileName), "items", keyPrefix] as const,
    keysOnly: (profileName: string, keyPrefix: string) => [...etcdQueryKeys.kvProfile(profileName), "keys", keyPrefix] as const,
    valuesInRange: (profileName: string, keyPrefix: string, paginatedKeys: string[]) => [...etcdQueryKeys.kvProfile(profileName), "values", keyPrefix, ...paginatedKeys] as const,
    clusterInfo: (profileName: string) => ["cluster-info", profileName] as const,
    metrics: (profileName: string, endpoint: Endpoint | null) => ["metrics", profileName, endpoint?.host ?? null, endpoint?.port ?? null] as const,
};

export interface UseEtcdItemsQueryResult {
    data: EtcdItem[];
    total: number;
    loadError: string | null;
    refetch: () => Promise<void>;
}

export function useEtcdItemsQuery({ enabled, keyPrefix, currentProfileName, searchQuery, currentPage, pageSize }: {
    enabled: boolean;
    keyPrefix: string;
    currentProfileName: string;
    searchQuery: string;
    currentPage: number;
    pageSize: number;
}): UseEtcdItemsQueryResult {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: etcdQueryKeys.fullItems(currentProfileName, keyPrefix),
        queryFn: async () => await fetchEtcdItems(keyPrefix),
        staleTime: 1000 * 60,
        enabled
    });

    const filteredData = useMemo(() => {
        if (!searchQuery) return query.data || [];
        return (query.data || []).filter(k => k.key.includes(searchQuery) || k.value.includes(searchQuery));
    }, [query.data, searchQuery]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredData.slice(startIndex, startIndex + pageSize);
    }, [filteredData, currentPage, pageSize]);


    return {
        data: paginatedData,
        total: filteredData.length,
        loadError: query.error as unknown as string,
        refetch: async () => {
            await queryClient.invalidateQueries({ queryKey: etcdQueryKeys.kvProfile(currentProfileName) });
        },
    };
}

export function useLazyValueEtcdItemsQuery({ enabled, keyPrefix, currentProfileName, searchQuery, currentPage, pageSize }: {
    enabled: boolean;
    keyPrefix: string;
    currentProfileName: string;
    searchQuery: string;
    currentPage: number;
    pageSize: number;
}): UseEtcdItemsQueryResult {
    const queryClient = useQueryClient();
    const keysOnlyQuery = useQuery({
        queryKey: etcdQueryKeys.keysOnly(currentProfileName, keyPrefix),
        queryFn: async () => await fetchEtcdKeysOnly(keyPrefix),
        enabled
    })

    // Filter and paginate keys
    const filteredKeys = useMemo(() => {
        if (!searchQuery) return keysOnlyQuery.data || [];
        return (keysOnlyQuery.data || []).filter(key => key.includes(searchQuery));
    }, [keysOnlyQuery.data, searchQuery]);
    const paginatedKeys = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredKeys.slice(startIndex, startIndex + pageSize);
    }, [filteredKeys, currentPage, pageSize]);

    const pagedKeysSet = useMemo(() => new Set(paginatedKeys), [paginatedKeys]);

    const valuesInRangeQuery = useQuery({
        queryKey: etcdQueryKeys.valuesInRange(currentProfileName, keyPrefix, paginatedKeys),
        queryFn: async () => await fetchValuesInRange(paginatedKeys[0], paginatedKeys[paginatedKeys.length - 1]),
        enabled: paginatedKeys.length > 0,
    })

    const lazyLoadError = keysOnlyQuery.error ?? valuesInRangeQuery.error;

    return {
        data: valuesInRangeQuery.data?.filter(item => pagedKeysSet.has(item.key)) || [],
        total: filteredKeys.length,
        loadError: lazyLoadError as unknown as string,
        refetch: async () => {
            await queryClient.invalidateQueries({ queryKey: etcdQueryKeys.kvProfile(currentProfileName) });
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
