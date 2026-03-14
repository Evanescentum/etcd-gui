import { useMemo } from "react";
import itemsjs from "itemsjs";
import type { ParsedMetricFamily } from "../api/etcd";
import { type LabelFacet, type MetricFamilyView, sampleMatchesLabelFilters, extractLabelKeys } from "../components/tabs/metrics/types";

interface SearchableMetricItem {
    name: string;
    help: string;
    type: string;
    group: string;
    labelKeys: string[];
    family: ParsedMetricFamily;
}

const metricGroupOrder = [
    "Server",
    "Disk & Storage",
    "Network & gRPC",
    "Process",
    "Go Runtime",
    "Prometheus Integration",
    "Other",
];

function classifyMetricGroup(name: string): string {
    if (name.startsWith("etcd_server")) return "Server";
    if (name.startsWith("etcd_disk") || name.startsWith("etcd_wal") || name.startsWith("etcd_snap")) return "Disk & Storage";
    if (name.startsWith("etcd_network") || name.startsWith("etcd_grpc") || name.startsWith("grpc")) return "Network & gRPC";
    if (name.startsWith("process_")) return "Process";
    if (name.startsWith("go_")) return "Go Runtime";
    if (name.startsWith("promhttp_")) return "Prometheus Integration";
    return "Other";
}

export { metricGroupOrder, classifyMetricGroup };

export interface UseMetricsSearchResult {
    familyViews: MetricFamilyView[];
    filteredFamilies: MetricFamilyView[];
    groupCounts: Record<string, number>;
    labelFacets: LabelFacet[];
}

export function useMetricsSearch({
    metricsData,
    searchQuery,
    selectedGroups,
    selectedTypes,
    selectedLabelFilters,
}: {
    metricsData: ParsedMetricFamily[] | undefined;
    searchQuery: string;
    selectedGroups: string[];
    selectedTypes: string[];
    selectedLabelFilters: string[];
}): UseMetricsSearchResult {
    // Step 1: Transform raw data into searchable items + familyViews
    const { items, familyViews } = useMemo(() => {
        if (!metricsData) return { items: [] as SearchableMetricItem[], familyViews: [] as MetricFamilyView[] };

        const searchItems: SearchableMetricItem[] = [];
        const views: MetricFamilyView[] = [];

        for (const family of metricsData) {
            const group = classifyMetricGroup(family.name);
            const labelKeys = extractLabelKeys(family.metrics);

            searchItems.push({
                name: family.name,
                help: family.help,
                type: family.type,
                group,
                labelKeys,
                family,
            });

            views.push({ family, group, labelKeys });
        }

        return { items: searchItems, familyViews: views };
    }, [metricsData]);

    // Step 2: Initialize itemsjs engine
    const engine = useMemo(() => {
        return itemsjs<SearchableMetricItem, string, "group" | "type">(items, {
            searchableFields: ["name", "help"],
            aggregations: {
                group: {
                    title: "Group",
                    size: metricGroupOrder.length,
                    sort: "term",
                    order: "asc",
                    conjunction: false,
                },
                type: {
                    title: "Type",
                    size: 10,
                    sort: "term",
                    order: "asc",
                    conjunction: false,
                },
            },
        });
    }, [items]);

    // Step 3: Execute search with filters (replaces searchTypeFilteredFamilies + groupCounts + groupFilteredFamilies)
    const searchResult = useMemo(() => {
        const filters: Partial<Record<"group" | "type", string[]>> = {};
        if (selectedGroups.length > 0) filters.group = selectedGroups;
        if (selectedTypes.length > 0) filters.type = selectedTypes;

        return engine.search({
            query: searchQuery || "",
            filters,
            per_page: 100000,
            is_all_filtered_items: false,
        });
    }, [engine, searchQuery, selectedGroups, selectedTypes]);

    // Step 3b: Extract group counts from aggregation (computed BEFORE group filter to show all group options)
    const groupCounts = useMemo(() => {
        // Re-run search WITHOUT group filter to get unfiltered group counts
        const preGroupResult = engine.search({
            query: searchQuery || "",
            filters: selectedTypes.length > 0 ? { type: selectedTypes } : {},
            per_page: 0,
        });

        const counts = Object.fromEntries(metricGroupOrder.map((g) => [g, 0])) as Record<string, number>;
        const buckets = preGroupResult.data.aggregations.group?.buckets ?? [];
        for (const bucket of buckets) {
            if (bucket.key in counts) {
                counts[bucket.key as string] = bucket.doc_count;
            }
        }
        return counts;
    }, [engine, searchQuery, selectedTypes]);

    // Step 4: Compute label facets from the group-filtered results
    const groupFilteredViews = useMemo<MetricFamilyView[]>(() => {
        return searchResult.data.items.map((item) => ({
            family: item.family,
            group: item.group,
            labelKeys: item.labelKeys,
        }));
    }, [searchResult]);

    const labelFacets = useMemo<LabelFacet[]>(() => {
        const facetMap = new Map<string, Map<string, number>>();

        for (const { family } of groupFilteredViews) {
            for (const sample of family.metrics) {
                if (!sample.labels) continue;

                for (const [key, value] of Object.entries(sample.labels)) {
                    const valueCounter = facetMap.get(key) ?? new Map<string, number>();
                    valueCounter.set(value, (valueCounter.get(value) ?? 0) + 1);
                    facetMap.set(key, valueCounter);
                }
            }
        }

        const facets: LabelFacet[] = [];
        for (const [key, valueMap] of facetMap.entries()) {
            const values = Array.from(valueMap.entries())
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

            const totalCount = values.reduce((sum, current) => sum + current.count, 0);
            facets.push({ key, totalCount, values });
        }

        return facets.sort((a, b) => b.totalCount - a.totalCount || a.key.localeCompare(b.key));
    }, [groupFilteredViews]);

    // Step 5: Apply label filters + sort
    const filteredFamilies = useMemo(() => {
        return groupFilteredViews
            .filter(({ family }) =>
                selectedLabelFilters.length === 0 ||
                family.metrics.some((sample) => sampleMatchesLabelFilters(sample, selectedLabelFilters))
            )
            .sort((a, b) => a.family.name.localeCompare(b.family.name));
    }, [groupFilteredViews, selectedLabelFilters]);

    return { familyViews, filteredFamilies, groupCounts, labelFacets };
}
