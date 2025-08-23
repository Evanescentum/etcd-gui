import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { EtcdItem, fetchEtcdItems, fetchEtcdKeysOnly, fetchValuesInRange } from "../api/etcd";

export function useEtcdItemsQuery({ keyPrefix, currentProfileName, configLoading }: {
    keyPrefix: string;
    currentProfileName: string;
    configLoading: boolean;
}): UseQueryResult<EtcdItem[], Error> {
    return useQuery({
        queryKey: ["etcd-items", currentProfileName, keyPrefix],
        queryFn: async () => await fetchEtcdItems(keyPrefix),
        staleTime: 1000 * 60,
        retry: 2,
        enabled: !configLoading
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
        staleTime: 1000 * 60,
        retry: 2,
        enabled: !configLoading
    });
}

export function useEtcdValuesInRangeQuery({ startKey, endKey, currentProfileName, enabled }: {
    startKey: string;
    endKey: string;
    currentProfileName: string;
    enabled: boolean;
}): UseQueryResult<EtcdItem[], Error> {
    return useQuery({
        queryKey: ["etcd-values-in-range", currentProfileName, startKey, endKey],
        queryFn: async () => await fetchValuesInRange(startKey, endKey),
        staleTime: 1000 * 60,
        retry: 2,
        enabled: enabled && !!startKey && !!endKey,
    });
}
