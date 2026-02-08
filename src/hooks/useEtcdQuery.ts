import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { EtcdItem, fetchEtcdKeysOnly, fetchValuesInRange, getClusterInfo, type ClusterInfo } from "../api/etcd";

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
        enabled: enabled && keys.length > 0,
    });
}
