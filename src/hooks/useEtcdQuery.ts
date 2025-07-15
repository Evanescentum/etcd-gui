import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { fetchEtcdItems } from "../api/etcd";

export function useEtcdItemsQuery({ keyPrefix, currentProfileName, configLoading }: {
    keyPrefix: string;
    currentProfileName: string | null;
    configLoading: boolean;
}): UseQueryResult<any[], Error> {
    return useQuery({
        queryKey: ["etcd-items", currentProfileName, keyPrefix],
        queryFn: async () => await fetchEtcdItems(keyPrefix),
        staleTime: 1000 * 60,
        retry: 2,
        enabled: !configLoading
    });
}
