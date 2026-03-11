import { useEffect, useMemo, useState } from "react";
import {
    Box,
    Button,
    Card,
    Flex,
    Heading,
    HStack,
    SimpleGrid,
    Spacer,
    Spinner,
    Text,
    VStack,
    Badge,
    EmptyState,
    Icon,
    Stat,
    Select,
    createListCollection,
} from "@chakra-ui/react";
import { Switch } from "@chakra-ui/react";
import {
    LuRefreshCw,
    LuActivity,
    LuServer,
    LuDatabase,
    LuTriangleAlert,
    LuClock,
    LuMonitorPlay,
    LuGlobe,
    LuSearch,
    LuServerCog,
} from "react-icons/lu";
import {
    type SortingState,
    type ColumnDef,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import type { Endpoint, ParsedMetricFamily, ParsedMetricSample } from "../../api/etcd";
import { useMetricsQuery } from "../../hooks/useEtcdQuery";
import { useDebounce } from "use-debounce";
import { formatBytes } from "@/utils/format";
import { useActiveProfile } from "@/contexts/active-profile";
import MetricsDetailDrawer from "./metrics/MetricsDetailDrawer";
import MetricsFilters from "./metrics/MetricsFilters";
import type { LabelFacet, MetricFamilyView } from "./metrics/types";


interface MetricsProps {
    configLoading: boolean;
    isActive: boolean;
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

const metricTypeOptions: ParsedMetricFamily["type"][] = ["COUNTER", "GAUGE", "HISTOGRAM", "SUMMARY", "UNTYPED"];

function parseLabelToken(token: string): { key: string; value: string } {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) {
        return { key: token, value: "" };
    }

    return {
        key: token.slice(0, separatorIndex),
        value: token.slice(separatorIndex + 1),
    };
}

function sampleMatchesLabelFilters(sample: { labels?: Record<string, string> }, labelTokens: string[]): boolean {
    if (labelTokens.length === 0) {
        return true;
    }

    if (!sample.labels) {
        return false;
    }

    return labelTokens.every((token) => {
        const { key, value } = parseLabelToken(token);
        return sample.labels?.[key] === value;
    });
}

function familyMatchesLabelFilters(family: ParsedMetricFamily, labelTokens: string[]): boolean {
    if (labelTokens.length === 0) {
        return true;
    }

    return family.metrics.some((sample) => sampleMatchesLabelFilters(sample, labelTokens));
}

function extractLabelKeys(samples: ParsedMetricSample[]): string[] {
    const labelKeySet = new Set<string>();

    for (const sample of samples) {
        if (!sample.labels) {
            continue;
        }

        for (const key of Object.keys(sample.labels)) {
            labelKeySet.add(key);
        }
    }

    return Array.from(labelKeySet).sort((a, b) => a.localeCompare(b));
}

function classifyMetricGroup(name: string): string {
    if (name.startsWith("etcd_server")) return "Server";
    if (name.startsWith("etcd_disk") || name.startsWith("etcd_wal") || name.startsWith("etcd_snap")) return "Disk & Storage";
    if (name.startsWith("etcd_network") || name.startsWith("etcd_grpc") || name.startsWith("grpc")) return "Network & gRPC";
    if (name.startsWith("process_")) return "Process";
    if (name.startsWith("go_")) return "Go Runtime";
    if (name.startsWith("promhttp_")) return "Prometheus Integration";
    return "Other";
}

function endpointKey(endpoint: Endpoint): string {
    return `${endpoint.host}:${endpoint.port}`;
}

function compareMetricCellValues(left: string | undefined, right: string | undefined): number {
    const leftValue = left ?? "";
    const rightValue = right ?? "";

    if (leftValue === rightValue) {
        return 0;
    }

    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    const canCompareNumerically =
        leftValue.trim() !== "" &&
        rightValue.trim() !== "" &&
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber);

    if (canCompareNumerically && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
    }

    return leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

const refreshIntervalCollection = createListCollection({
    items: [
        5,
        10,
        30,
        60,
    ],
    itemToString: (value) => `${value}s`,
    itemToValue: (value) => value.toString(),
});

const Metrics = ({ configLoading, isActive }: MetricsProps) => {
    const { activeProfile } = useActiveProfile();

    const [selectedNode, setSelectedNode] = useState<Endpoint>(activeProfile.endpoints[0]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(10);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<ParsedMetricFamily["type"][]>([]);
    const [selectedLabelFilters, setSelectedLabelFilters] = useState<string[]>([]);
    const [activeMetricName, setActiveMetricName] = useState<string | null>(null);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    const [detailSearchQuery, setDetailSearchQuery] = useState("");
    const [detailSorting, setDetailSorting] = useState<SortingState>([]);

    const nodeCollection = useMemo(() => createListCollection({
        items: activeProfile.endpoints,
        itemToString: endpointKey,
        itemToValue: endpointKey,
    }), [activeProfile.endpoints]);

    const {
        data: metricsData,
        isError,
        error,
        refetch,
        isFetching,
        dataUpdatedAt
    } = useMetricsQuery({
        currentProfileName: activeProfile.name,
        configLoading,
        endpoint: selectedNode,
        isActive,
        autoRefresh,
        intervalMs: refreshInterval * 1000
    });

    const errorMessage = error ? error.message : "Unknown error";

    // Extract key overview stats
    const overviewStats = useMemo(() => {
        if (!metricsData) return null;

        const findMetricValue = (name: string, metricsExtractor?: (samples: ParsedMetricSample[]) => string | null): number | null => {
            const family = metricsData.find(m => m.name === name);
            if (!family || !family.metrics.length) return null;

            if (metricsExtractor) {
                const extractedValue = metricsExtractor(family.metrics);
                return extractedValue ? Number(extractedValue) : null;
            }
            return Number(family.metrics[0].value);
        };

        return {
            hasLeader: findMetricValue('etcd_server_has_leader') === 1,
            leaderChanges: findMetricValue('etcd_server_leader_changes_seen_total') ?? 0,
            commitIndex: findMetricValue('etcd_debugging_store_expires_total') ?? 0, // Fallback/Proxy stat
            dbSize: findMetricValue('etcd_mvcc_db_total_size_in_bytes') ?? 0,
            dbSizeUse: findMetricValue('etcd_mvcc_db_total_size_in_use_in_bytes') ?? 0,
            clientConns: findMetricValue('grpc_server_handled_total', (samples) => {
                const unarySamples = samples.filter((s) => s.labels?.["grpc_type"] === "unary");
                return unarySamples.reduce((sum, s) => sum + Number(s.value), 0).toString();
            }) ?? 0,
            threads: findMetricValue('go_goroutines') ?? 0,
            processMem: findMetricValue('process_resident_memory_bytes') ?? 0,
            version: "N/A"
        };
    }, [metricsData]);


    const familyViews = useMemo<MetricFamilyView[]>(() => {
        if (!metricsData) {
            return [];
        }

        return metricsData.map((family) => {
            return {
                family,
                group: classifyMetricGroup(family.name),
                labelKeys: extractLabelKeys(family.metrics),
            };
        });
    }, [metricsData]);

    const searchTypeFilteredFamilies = useMemo(() => {
        return familyViews.filter(({ family }) => {
            if (
                debouncedSearchQuery &&
                !family.name.toLowerCase().includes(debouncedSearchQuery) &&
                !family.help.toLowerCase().includes(debouncedSearchQuery)
            ) {
                return false;
            }

            if (selectedTypes.length > 0 && !selectedTypes.includes(family.type)) {
                return false;
            }

            return true;
        });
    }, [familyViews, debouncedSearchQuery, selectedTypes]);

    const groupCounts = useMemo(() => {
        const counts = Object.fromEntries(metricGroupOrder.map((group) => [group, 0])) as Record<string, number>;

        for (const item of searchTypeFilteredFamilies) {
            counts[item.group] += 1;
        }

        return counts;
    }, [searchTypeFilteredFamilies]);

    const groupFilteredFamilies = useMemo(() => {
        if (selectedGroups.length === 0) {
            return searchTypeFilteredFamilies;
        }

        return searchTypeFilteredFamilies.filter((item) => selectedGroups.includes(item.group));
    }, [searchTypeFilteredFamilies, selectedGroups]);

    const labelFacets = useMemo<LabelFacet[]>(() => {
        const facetMap = new Map<string, Map<string, number>>();

        for (const { family } of groupFilteredFamilies) {
            for (const sample of family.metrics) {
                if (!sample.labels) {
                    continue;
                }

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
    }, [groupFilteredFamilies]);

    const filteredFamilies = useMemo(() => {
        const list = groupFilteredFamilies.filter(({ family }) => familyMatchesLabelFilters(family, selectedLabelFilters));
        return [...list].sort((a, b) => a.family.name.localeCompare(b.family.name));
    }, [groupFilteredFamilies, selectedLabelFilters]);

    const activeFamily = useMemo(() => {
        if (!activeMetricName) {
            return null;
        }

        return familyViews.find((item) => item.family.name === activeMetricName) ?? null;
    }, [familyViews, activeMetricName]);

    const detailLabelColumns = useMemo(() => {
        return activeFamily?.labelKeys ?? [];
    }, [activeFamily]);

    const detailRows = useMemo(() => {
        if (!activeFamily) {
            return [];
        }

        const lowerDetailSearch = detailSearchQuery.trim().toLowerCase();

        return activeFamily.family.metrics.filter((sample) => {
            if (!sampleMatchesLabelFilters(sample, selectedLabelFilters)) {
                return false;
            }

            if (!lowerDetailSearch) {
                return true;
            }

            const labelsText = sample.labels
                ? Object.entries(sample.labels)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(" ")
                    .toLowerCase()
                : "";

            return sample.value.toLowerCase().includes(lowerDetailSearch) || labelsText.includes(lowerDetailSearch);
        });
    }, [activeFamily, detailSearchQuery, selectedLabelFilters]);

    const detailColumns = useMemo((): ColumnDef<ParsedMetricSample, string>[] => {
        let cols: ColumnDef<ParsedMetricSample, string>[] = detailLabelColumns.map((key) => ({
            id: key,
            accessorFn: (row) => row.labels?.[key] ?? "-",
            header: key,
            cell: (info) => info.getValue(),
            sortingFn: (rowA, rowB, columnId) =>
                compareMetricCellValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        }));

        cols.push({
            id: "value",
            accessorFn: (row) => row.value,
            header: "Value",
            cell: (info) => info.getValue(),
            sortingFn: (rowA, rowB, columnId) =>
                compareMetricCellValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        });

        return cols;
    }, [detailLabelColumns]);

    const detailTable = useReactTable({
        data: detailRows,
        columns: detailColumns,
        state: { sorting: detailSorting },
        onSortingChange: setDetailSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const appliedFilterCount =
        (debouncedSearchQuery ? 1 : 0) +
        selectedGroups.length +
        selectedTypes.length +
        selectedLabelFilters.length;

    const clearAllFilters = () => {
        setSearchQuery("");
        setSelectedGroups([]);
        setSelectedTypes([]);
        setSelectedLabelFilters([]);
    };

    const handleOpenMetricDetails = (metricName: string) => {
        setActiveMetricName(metricName);
        setDetailSearchQuery("");
        setDetailSorting([]);
        setIsDetailDrawerOpen(true);
    };

    const handleDetailDrawerOpenChange = (open: boolean) => {
        setIsDetailDrawerOpen(open);
        if (!open) {
            setDetailSearchQuery("");
            setDetailSorting([]);
        }
    };

    useEffect(() => {
        if (!isDetailDrawerOpen || !activeMetricName) {
            return;
        }

        const metricStillExists = familyViews.some((item) => item.family.name === activeMetricName);
        if (!metricStillExists) {
            setIsDetailDrawerOpen(false);
            setActiveMetricName(null);
            setDetailSearchQuery("");
            setDetailSorting([]);
        }
    }, [familyViews, isDetailDrawerOpen, activeMetricName]);

    return (
        <Flex direction="column" height="100vh">
            <Flex marginTop={0} direction="column" overflowY="auto">
                {/* Header */}
                <Box
                    width="full"
                    p={6}
                    borderBottomWidth="1px"
                >
                    <Flex align="center" wrap="wrap" gap={4}>
                        <HStack gap={3}>
                            <Icon fontSize="2xl">
                                <LuActivity />
                            </Icon>
                            <Box>
                                <Heading size="lg">Metrics</Heading>
                                <Text fontSize="sm" opacity={0.9} mt={0.5}>
                                    Prometheus metrics monitoring
                                </Text>
                            </Box>
                        </HStack>

                        <Spacer />

                        <HStack gap={6} flexWrap="wrap">
                            <VStack align="flex-start" gap={1} minW="220px">
                                <Text fontSize="xs" color="fg.muted">Node</Text>
                                <Select.Root
                                    collection={nodeCollection}
                                    width="220px"
                                    value={[endpointKey(selectedNode)]}
                                    onValueChange={(e) => { setSelectedNode(e.items[0]) }}
                                    disabled={nodeCollection.items.length === 0}
                                >
                                    <Select.Control>
                                        <Select.Trigger>
                                            <HStack gap={2} flex="1" minW={0}>
                                                <LuServerCog />
                                                <Select.ValueText placeholder="No nodes available" />
                                            </HStack>
                                        </Select.Trigger>
                                        <Select.IndicatorGroup>
                                            <Select.Indicator />
                                        </Select.IndicatorGroup>
                                    </Select.Control>
                                    <Select.Positioner>
                                        <Select.Content>
                                            {nodeCollection.items.map((item, index) => (
                                                <Select.Item item={item} key={index}>
                                                    {item.host}:{item.port}
                                                    <Select.ItemIndicator />
                                                </Select.Item>
                                            ))}
                                        </Select.Content>
                                    </Select.Positioner>
                                </Select.Root>
                            </VStack>

                            <Box borderLeftWidth="1px" height="30px" alignSelf="center" />

                            <VStack align="flex-end" gap={0}>
                                <Text fontSize="xs" color="fg.muted">Last Updated</Text>
                                <HStack gap={1}>
                                    <Icon fontSize="xs" color={isFetching ? "blue.500" : "gray.500"}><LuClock /></Icon>
                                    <Text fontSize="sm" fontFamily="mono" color={isFetching ? "blue.500" : "fg"}>{
                                        dataUpdatedAt === 0 ? "Never" : new Date(dataUpdatedAt).toLocaleTimeString()
                                    }</Text>
                                </HStack>
                            </VStack>

                            <Box borderLeftWidth="1px" height="30px" alignSelf="center" />

                            <HStack align="center" gap={2}>
                                <Text fontSize="sm" fontWeight="medium">Auto Refresh</Text>
                                <Switch.Root
                                    checked={autoRefresh}
                                    onCheckedChange={(e: any) => setAutoRefresh(e.checked)}
                                >
                                    <Switch.HiddenInput />
                                    <Switch.Control />
                                </Switch.Root>
                            </HStack>

                            <Select.Root
                                collection={refreshIntervalCollection}
                                width="96px"
                                value={[refreshInterval.toString()]}
                                onValueChange={(e) => { setRefreshInterval(e.items[0]) }}
                                disabled={!autoRefresh}
                            >
                                <Select.Control>
                                    <Select.Trigger>
                                        <Select.ValueText />
                                    </Select.Trigger>
                                    <Select.IndicatorGroup>
                                        <Select.Indicator />
                                    </Select.IndicatorGroup>
                                </Select.Control>
                                <Select.Positioner>
                                    <Select.Content>
                                        {refreshIntervalCollection.items.map((item) => (
                                            <Select.Item item={item} key={item.toString()}>
                                                {item.toString()}s
                                                <Select.ItemIndicator />
                                            </Select.Item>
                                        ))}
                                    </Select.Content>
                                </Select.Positioner>
                            </Select.Root>

                            <Button
                                onClick={() => { refetch() }}
                                loading={isFetching}
                                disabled={autoRefresh}
                                size="md"
                                variant="outline"
                            >
                                <LuRefreshCw />
                                Refresh
                            </Button>
                        </HStack>
                    </Flex>
                </Box>

                {/* Content */}
                <Box p={6}>
                    {!metricsData && isFetching && !isError ? (
                        <Flex direction="column" align="center" justify="center" p={10}>
                            <Spinner size="xl" />
                            <Text mt={4}>Loading metrics...</Text>
                        </Flex>
                    ) : isError && !metricsData ? (
                        <Flex direction="column" minH="60vh" align="center" justify="center">
                            <EmptyState.Root>
                                <EmptyState.Content>
                                    <EmptyState.Indicator>
                                        <LuTriangleAlert size={48} color="red" />
                                    </EmptyState.Indicator>
                                    <VStack textAlign="center" gap={3}>
                                        <EmptyState.Title>Failed to Fetch Metrics</EmptyState.Title>
                                        <EmptyState.Description>
                                            <Text color="red.500" fontWeight="medium" maxW="400px">
                                                {errorMessage}
                                            </Text>
                                        </EmptyState.Description>
                                        <Button onClick={() => { refetch() }} mt={4} loading={isFetching}>
                                            <LuRefreshCw style={{ marginRight: "0.5rem" }} />
                                            Retry
                                        </Button>
                                    </VStack>
                                </EmptyState.Content>
                            </EmptyState.Root>
                        </Flex>
                    ) : (
                        <VStack gap={6} align="stretch">
                            {isError && metricsData && (
                                <Card.Root borderColor="red.200" bg="red.50" variant="outline">
                                    <Card.Body>
                                        <Flex align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap={4}>
                                            <HStack gap={3} align="start" flex="1">
                                                <Icon color="red.500" mt={0.5}>
                                                    <LuTriangleAlert />
                                                </Icon>
                                                <Box>
                                                    <Text fontWeight="semibold" color="red.700">Latest refresh failed</Text>
                                                    <Text color="red.600">{errorMessage}</Text>
                                                    <Text fontSize="sm" color="red.600">Showing the last successful metrics snapshot.</Text>
                                                </Box>
                                            </HStack>
                                            <Button onClick={() => { refetch() }} loading={isFetching} alignSelf={{ base: "stretch", md: "center" }}>
                                                <LuRefreshCw />
                                                Retry
                                            </Button>
                                        </Flex>
                                    </Card.Body>
                                </Card.Root>
                            )}

                            {/* Overview Cards */}
                            {overviewStats && (
                                <Box>
                                    <HStack mb={4} gap={2}>
                                        <Icon fontSize="lg" color="green.500">
                                            <LuMonitorPlay />
                                        </Icon>
                                        <Heading size="md" color="fg.emphasized">
                                            Cluster Health & Usage
                                        </Heading>
                                    </HStack>
                                    <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={5}>
                                        <Card.Root variant="elevated">
                                            <Card.Body>
                                                <Stat.Root colorPalette={overviewStats.hasLeader ? "green" : "red"} size="lg">
                                                    <HStack justify="space-between" mb={3}>
                                                        <Box p={2} borderRadius="lg" bg={overviewStats.hasLeader ? "green.100" : "red.100"} color={overviewStats.hasLeader ? "green.700" : "red.700"} _dark={{ bg: overviewStats.hasLeader ? "green.900" : "red.900", color: overviewStats.hasLeader ? "green.200" : "red.200" }}>
                                                            <Icon fontSize="xl"><LuServer /></Icon>
                                                        </Box>
                                                    </HStack>
                                                    <Stat.Label>Has Leader</Stat.Label>
                                                    <Stat.ValueText>{overviewStats.hasLeader ? "Yes" : "No"}</Stat.ValueText>
                                                    <Stat.HelpText>Leader changes seen: {overviewStats.leaderChanges}</Stat.HelpText>
                                                </Stat.Root>
                                            </Card.Body>
                                        </Card.Root>

                                        <Card.Root variant="elevated">
                                            <Card.Body>
                                                <Stat.Root colorPalette="purple" size="lg">
                                                    <HStack justify="space-between" mb={3}>
                                                        <Box p={2} borderRadius="lg" bg="purple.100" color="purple.700" _dark={{ bg: "purple.900", color: "purple.200" }}>
                                                            <Icon fontSize="xl"><LuDatabase /></Icon>
                                                        </Box>
                                                    </HStack>
                                                    <Stat.Label>DB Size</Stat.Label>
                                                    <HStack gap={1} align="baseline">
                                                        <Stat.ValueText>{formatBytes(overviewStats.dbSize).value}</Stat.ValueText>
                                                        <Stat.ValueUnit>{formatBytes(overviewStats.dbSize).unit}</Stat.ValueUnit>
                                                    </HStack>
                                                    <Stat.HelpText>In use: {formatBytes(overviewStats.dbSizeUse).value} {formatBytes(overviewStats.dbSizeUse).unit}</Stat.HelpText>
                                                </Stat.Root>
                                            </Card.Body>
                                        </Card.Root>

                                        <Card.Root variant="elevated">
                                            <Card.Body>
                                                <Stat.Root colorPalette="blue" size="lg">
                                                    <HStack justify="space-between" mb={3}>
                                                        <Box p={2} borderRadius="lg" bg="blue.100" color="blue.700" _dark={{ bg: "blue.900", color: "blue.200" }}>
                                                            <Icon fontSize="xl"><LuGlobe /></Icon>
                                                        </Box>
                                                    </HStack>
                                                    <Stat.Label>gRPC Handled Unary</Stat.Label>
                                                    <Stat.ValueText>{overviewStats.clientConns}</Stat.ValueText>
                                                    <Stat.HelpText>Across all services</Stat.HelpText>
                                                </Stat.Root>
                                            </Card.Body>
                                        </Card.Root>

                                        <Card.Root variant="elevated">
                                            <Card.Body>
                                                <Stat.Root colorPalette="orange" size="lg">
                                                    <HStack justify="space-between" mb={3}>
                                                        <Box p={2} borderRadius="lg" bg="orange.100" color="orange.700" _dark={{ bg: "orange.900", color: "orange.200" }}>
                                                            <Icon fontSize="xl"><LuActivity /></Icon>
                                                        </Box>
                                                    </HStack>
                                                    <Stat.Label>Memory Usage (RSS)</Stat.Label>
                                                    <HStack gap={1} align="baseline">
                                                        <Stat.ValueText>{formatBytes(overviewStats.processMem).value}</Stat.ValueText>
                                                        <Stat.ValueUnit>{formatBytes(overviewStats.processMem).unit}</Stat.ValueUnit>
                                                    </HStack>
                                                    <Stat.HelpText>Go Routines: {overviewStats.threads}</Stat.HelpText>
                                                </Stat.Root>
                                            </Card.Body>
                                        </Card.Root>
                                    </SimpleGrid>
                                </Box>
                            )}

                            {/* Metrics Explorer */}
                            <Box mt={4}>
                                <Flex mb={4} align="center" justify="space-between">
                                    <HStack gap={2}>
                                        <Icon fontSize="lg" color="gray.500">
                                            <LuActivity />
                                        </Icon>
                                        <Heading size="md" color="fg.emphasized">
                                            Metrics Explorer
                                        </Heading>
                                    </HStack>
                                    <Badge colorPalette="blue" variant="subtle">
                                        {filteredFamilies.length} families
                                    </Badge>
                                </Flex>

                                <Flex gap={6} align="start" direction={{ base: "column", xl: "row" }}>
                                    <MetricsFilters
                                        metricGroupOrder={metricGroupOrder}
                                        metricTypeOptions={metricTypeOptions}
                                        searchQuery={searchQuery}
                                        onSearchQueryChange={setSearchQuery}
                                        selectedGroups={selectedGroups}
                                        setSelectedGroups={setSelectedGroups}
                                        groupCounts={groupCounts}
                                        selectedTypes={selectedTypes}
                                        setSelectedTypes={setSelectedTypes}
                                        labelFacets={labelFacets}
                                        selectedLabelFilters={selectedLabelFilters}
                                        setSelectedLabelFilters={setSelectedLabelFilters}
                                        appliedFilterCount={appliedFilterCount}
                                        onClearAllFilters={clearAllFilters}
                                    />

                                    <VStack flex="1" align="stretch" gap={4}>
                                        {selectedLabelFilters.length > 0 && (
                                            <Card.Root variant="subtle">
                                                <Card.Body>
                                                    <VStack align="stretch" gap={2}>
                                                        <Text fontSize="sm" color="fg.muted">Active Label Filters</Text>
                                                        <HStack gap={2} wrap="wrap">
                                                            {selectedLabelFilters.map((token) => (
                                                                <Badge key={token} variant="subtle" colorPalette="purple">
                                                                    {token}
                                                                </Badge>
                                                            ))}
                                                        </HStack>
                                                    </VStack>
                                                </Card.Body>
                                            </Card.Root>
                                        )}

                                        {filteredFamilies.length === 0 ? (
                                            <EmptyState.Root p={8} borderWidth="1px" borderRadius="lg">
                                                <EmptyState.Content>
                                                    <EmptyState.Indicator>
                                                        <LuSearch />
                                                    </EmptyState.Indicator>
                                                    <EmptyState.Title>No metrics found</EmptyState.Title>
                                                    <EmptyState.Description>Try relaxing filters or searching with fewer keywords.</EmptyState.Description>
                                                </EmptyState.Content>
                                            </EmptyState.Root>
                                        ) : (
                                            <VStack gap={3} align="stretch">
                                                {filteredFamilies.map(({ family, group, labelKeys }) => {
                                                    const hasLabels = labelKeys.length > 0;
                                                    const directValues = family.metrics[0]?.value ?? "";

                                                    return (
                                                        <Card.Root key={family.name} variant="outline">
                                                            <Card.Body>
                                                                <VStack align="stretch" gap={3}>
                                                                    <HStack justify="space-between" align="start">
                                                                        <Box>
                                                                            <Text fontWeight="bold" fontFamily="mono" mb={1}>{family.name}</Text>
                                                                            <Text fontSize="sm" color="fg.muted" lineClamp={2}>{family.help}</Text>
                                                                        </Box>
                                                                        {hasLabels && (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() => handleOpenMetricDetails(family.name)}
                                                                            >
                                                                                Open Details
                                                                            </Button>
                                                                        )}
                                                                    </HStack>

                                                                    <HStack gap={2} wrap="wrap">
                                                                        <Badge colorPalette="blue" variant="subtle">{group}</Badge>
                                                                        <Badge variant="subtle">{family.type}</Badge>
                                                                        <Badge variant="outline" display={family.metrics.length > 1 ? "flex" : "none"}>
                                                                            {family.metrics.length} samples
                                                                        </Badge>
                                                                    </HStack>

                                                                    {labelKeys.length > 0 && (
                                                                        <HStack gap={2} wrap="wrap">
                                                                            {labelKeys.slice(0, 6).map((key) => (
                                                                                <Badge key={key} variant="outline" colorPalette="gray" fontFamily="mono">
                                                                                    {key}
                                                                                </Badge>
                                                                            ))}
                                                                            {labelKeys.length > 6 && (
                                                                                <Badge variant="subtle" colorPalette="gray">
                                                                                    +{labelKeys.length - 6} more
                                                                                </Badge>
                                                                            )}
                                                                        </HStack>
                                                                    )}

                                                                    {!hasLabels && <>
                                                                        <HStack gap={4} align="baseline">
                                                                            <Text fontSize="sm" color="fg.muted" mb={1}>Value</Text>
                                                                            <Text fontFamily="mono" fontWeight="medium" fontSize="sm">{directValues}</Text>
                                                                        </HStack>
                                                                    </>}
                                                                </VStack>
                                                            </Card.Body>
                                                        </Card.Root>
                                                    );
                                                })}
                                            </VStack>
                                        )}
                                    </VStack>
                                </Flex>
                            </Box>
                        </VStack>
                    )}
                </Box>
            </Flex>

            <MetricsDetailDrawer
                open={isDetailDrawerOpen}
                onOpenChange={handleDetailDrawerOpenChange}
                activeFamily={activeFamily}
                detailLabelColumns={detailLabelColumns}
                detailSearchQuery={detailSearchQuery}
                onDetailSearchQueryChange={setDetailSearchQuery}
                detailRows={detailRows}
                detailTable={detailTable}
            />
        </Flex>
    );
};

export default Metrics;