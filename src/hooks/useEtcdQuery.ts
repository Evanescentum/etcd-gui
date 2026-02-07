import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { EtcdItem, fetchEtcdItems, fetchEtcdKeysOnly, fetchValuesInRange, getClusterInfo, type ClusterInfo } from "../api/etcd";

export function useEtcdItemsQuery({ keyPrefix, currentProfileName, configLoading }: {
    keyPrefix: string;
    currentProfileName: string;
    configLoading: boolean;
}): UseQueryResult<EtcdItem[], Error> {
    return useQuery({
        queryKey: ["etcd-items", currentProfileName, keyPrefix],
        queryFn: async () => await fetchEtcdItems(keyPrefix),
        staleTime: 1000 * 60,
        enabled: !configLoading
    });
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

export function useEtcdKeysOnlyQuery({ keyPrefix, currentProfileName, configLoading }: {
    keyPrefix: string;
    currentProfileName: string;
    configLoading: boolean;
}): UseQueryResult<string[], Error> {
    return useQuery({
        queryKey: ["etcd-keys-only", currentProfileName, keyPrefix],
        queryFn: async () => await fetchEtcdKeysOnly(keyPrefix),
        staleTime: 1000 * 5, // 5 seconds instead of 60
        refetchOnMount: "always",
        enabled: !configLoading
    });
}

export function useEtcdValuesInRangeQuery({ keys, currentProfileName, enabled }: {
    keys: string[];
    currentProfileName: string;
    enabled: boolean;
}): UseQueryResult<EtcdItem[], Error> {
    const startKey = keys[0];
    const endKey = keys[keys.length - 1];
    return useQuery({
        queryKey: ["etcd-values-in-range", currentProfileName, keys],
        queryFn: async () => await fetchValuesInRange(startKey, endKey),
        staleTime: 1000 * 5, // 5 seconds instead of 60
        refetchOnMount: "always",
        enabled: enabled && keys.length > 0,
    });
}
