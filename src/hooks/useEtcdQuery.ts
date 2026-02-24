import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { EtcdItem, fetchEtcdItems, fetchEtcdKeysOnly, fetchValuesInRange, getClusterInfo, type ClusterInfo } from "../api/etcd";
import { useMemo } from "react";

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
    const query = useQuery({
        queryKey: ["etcd-items", currentProfileName, keyPrefix],
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
        loadError: query.error ? (query.error.message || "Unknown error") : null,
        refetch: async () => { await query.refetch(); },
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
    const keysOnlyQuery = useQuery({
        queryKey: ["etcd-keys-only", currentProfileName, keyPrefix],
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
        queryKey: ["etcd-values-in-range", currentProfileName, paginatedKeys],
        queryFn: async () => await fetchValuesInRange(paginatedKeys[0], paginatedKeys[paginatedKeys.length - 1]),
        enabled: paginatedKeys.length > 0,
    })

    return {
        data: valuesInRangeQuery.data?.filter(item => pagedKeysSet.has(item.key)) || [],
        total: filteredKeys.length,
        loadError: valuesInRangeQuery.error ? (valuesInRangeQuery.error.message || "Unknown error") : null,
        refetch: async () => { await keysOnlyQuery.refetch(); },
    };
}

export function useClusterInfoQuery({ currentProfileName, configLoading }: {
    currentProfileName: string;
    configLoading: boolean;
}): UseQueryResult<ClusterInfo, Error> {
    return useQuery({
        queryKey: ["cluster-info", currentProfileName],
        queryFn: async () => await getClusterInfo(),
        staleTime: 1000 * 60,
        enabled: !configLoading && !!currentProfileName,
    });
}
