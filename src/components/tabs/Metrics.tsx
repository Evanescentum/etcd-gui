import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import type { Endpoint, ParsedMetricFamily } from "../../api/etcd";
import { useMetricsQuery } from "../../hooks/useEtcdQuery";
import { useMetricsSearch, metricGroupOrder } from "../../hooks/useMetricsSearch";
import { useDebounce } from "use-debounce";
import { formatBytes } from "@/utils/format";
import { useActiveProfile } from "@/contexts/active-profile";
import MetricsDetailDrawer from "./metrics/MetricsDetailDrawer";
import MetricsFilters from "./metrics/MetricsFilters";


interface MetricsProps {
    configLoading: boolean;
    isActive: boolean;
}

const metricTypeOptions: ParsedMetricFamily["type"][] = ["COUNTER", "GAUGE", "HISTOGRAM", "SUMMARY", "UNTYPED"];

function endpointKey(endpoint: Endpoint): string {
    return `${endpoint.host}:${endpoint.port}`;
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

    const metricValue = (name: string): number | null => {
        const family = metricsData?.find(m => m.name === name);
        if (!family?.metrics.length) return null;
        return Number(family.metrics[0].value);
    };

    const overviewCards = useMemo((): { color: string; icon: ReactNode; label: string; value: string; unit?: string; help: string }[] | null => {
        if (!metricsData) return null;

        const hasLeader = metricValue('etcd_server_has_leader') === 1;
        const leaderChanges = metricValue('etcd_server_leader_changes_seen_total') ?? 0;
        const dbSize = metricValue('etcd_mvcc_db_total_size_in_bytes') ?? 0;
        const dbSizeUse = metricValue('etcd_mvcc_db_total_size_in_use_in_bytes') ?? 0;
        const grpcFamily = metricsData.find(m => m.name === 'grpc_server_handled_total');
        const clientConns = grpcFamily
            ? grpcFamily.metrics.filter(s => s.labels?.["grpc_type"] === "unary").reduce((sum, s) => sum + Number(s.value), 0)
            : 0;
        const threads = metricValue('go_goroutines') ?? 0;
        const processMem = metricValue('process_resident_memory_bytes') ?? 0;

        return [
            { color: hasLeader ? "green" : "red", icon: <LuServer />, label: "Has Leader", value: hasLeader ? "Yes" : "No", help: `Leader changes seen: ${leaderChanges}` },
            { color: "purple", icon: <LuDatabase />, label: "DB Size", value: formatBytes(dbSize).value, unit: formatBytes(dbSize).unit, help: `In use: ${formatBytes(dbSizeUse).value} ${formatBytes(dbSizeUse).unit}` },
            { color: "blue", icon: <LuGlobe />, label: "gRPC Handled Unary", value: String(clientConns), help: "Across all services" },
            { color: "orange", icon: <LuActivity />, label: "Memory Usage (RSS)", value: formatBytes(processMem).value, unit: formatBytes(processMem).unit, help: `Go Routines: ${threads}` },
        ];
    }, [metricsData]);

    const { familyViews, filteredFamilies, groupCounts, labelFacets } = useMetricsSearch({
        metricsData,
        searchQuery: debouncedSearchQuery,
        selectedGroups,
        selectedTypes,
        selectedLabelFilters,
    });

    const activeFamily = useMemo(() => {
        if (!activeMetricName) return null;
        return familyViews.find((item) => item.family.name === activeMetricName) ?? null;
    }, [familyViews, activeMetricName]);

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
        setIsDetailDrawerOpen(true);
    };

    useEffect(() => {
        if (!isDetailDrawerOpen || !activeMetricName) return;

        const metricStillExists = familyViews.some((item) => item.family.name === activeMetricName);
        if (!metricStillExists) {
            setIsDetailDrawerOpen(false);
            setActiveMetricName(null);
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
                            {overviewCards && (
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
                                        {overviewCards.map((card) => (
                                            <Card.Root key={card.label} variant="elevated">
                                                <Card.Body>
                                                    <Stat.Root colorPalette={card.color} size="lg">
                                                        <HStack justify="space-between" mb={3}>
                                                            <Box p={2} borderRadius="lg" bg={`${card.color}.100`} color={`${card.color}.700`} _dark={{ bg: `${card.color}.900`, color: `${card.color}.200` }}>
                                                                <Icon fontSize="xl">{card.icon}</Icon>
                                                            </Box>
                                                        </HStack>
                                                        <Stat.Label>{card.label}</Stat.Label>
                                                        {card.unit ? (
                                                            <HStack gap={1} align="baseline">
                                                                <Stat.ValueText>{card.value}</Stat.ValueText>
                                                                <Stat.ValueUnit>{card.unit}</Stat.ValueUnit>
                                                            </HStack>
                                                        ) : (
                                                            <Stat.ValueText>{card.value}</Stat.ValueText>
                                                        )}
                                                        <Stat.HelpText>{card.help}</Stat.HelpText>
                                                    </Stat.Root>
                                                </Card.Body>
                                            </Card.Root>
                                        ))}
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
                onOpenChange={setIsDetailDrawerOpen}
                activeFamily={activeFamily}
                selectedLabelFilters={selectedLabelFilters}
            />
        </Flex>
    );
};

export default Metrics;