import { useMemo } from "react";
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
    Table,
    Text,
    VStack,
    Badge,
    EmptyState,
    Icon,
    Stat,
} from "@chakra-ui/react";
import { Tooltip } from "../ui/tooltip";
import { toaster } from "../ui/toaster";
import {
    LuRefreshCw,
    LuServer,
    LuDatabase,
    LuNetwork,
    LuTriangleAlert,
    LuUsers,
    LuGitBranch,
    LuShield,
    LuGlobe,
} from "react-icons/lu";
import type { AppConfig } from "../../api/etcd";
import { useClusterInfoQuery } from "../../hooks/useEtcdQuery";

interface ClusterProps {
    configLoading: boolean;
    appConfig: AppConfig;
}

function Cluster({ configLoading, appConfig }: ClusterProps) {
    const currentProfileName = useMemo(() => appConfig.current_profile ?? "default", [appConfig]);

    const {
        data: clusterInfo,
        isError,
        error,
        refetch,
        isFetching,
    } = useClusterInfoQuery({ currentProfileName, configLoading });

    const handleCopyClusterId = async (clusterId: number | string) => {
        try {
            await navigator.clipboard.writeText(String(clusterId));
            toaster.success({
                title: "复制成功",
                description: "Cluster ID 已复制到剪贴板",
            });
        } catch (err) {
            toaster.error({
                title: "复制失败",
                description: "无法复制到剪贴板",
            });
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return { value: "0", unit: "Bytes" };
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const value = (Math.round((bytes / Math.pow(k, i)) * 100) / 100).toString();
        return { value, unit: sizes[i] };
    };

    const dbSize = formatBytes(clusterInfo?.db_size || 0);

    if (isFetching && !clusterInfo) {
        return (
            <Flex direction="column" height="100vh" align="center" justify="center">
                <Spinner size="xl" />
                <Text mt={4}>Loading cluster information...</Text>
            </Flex>
        );
    }

    if (isError) {
        const errorMessage = typeof error === "string" ? error : (error instanceof Error ? error.message : "Unknown error");
        return (
            <Flex direction="column" height="100vh" align="center" justify="center">
                <EmptyState.Root>
                    <EmptyState.Content>
                        <EmptyState.Indicator>
                            <LuTriangleAlert size={48} color="red" />
                        </EmptyState.Indicator>
                        <VStack textAlign="center" gap={3}>
                            <EmptyState.Title>Failed to Load Cluster Info</EmptyState.Title>
                            <EmptyState.Description>
                                <Text color="red.500" fontWeight="medium">
                                    {errorMessage}
                                </Text>
                            </EmptyState.Description>
                            <Button onClick={() => refetch()} mt={4}>
                                <LuRefreshCw style={{ marginRight: "0.5rem" }} />
                                Retry
                            </Button>
                        </VStack>
                    </EmptyState.Content>
                </EmptyState.Root>
            </Flex>
        );
    }

    if (!clusterInfo) {
        return null;
    }

    const leaderMember = clusterInfo.members.find((m) => m.id === clusterInfo.leader);

    return (
        <Flex direction="column" height="100vh">
            <Flex marginTop={0} direction="column" overflowY="auto">
                {/* Header */}
                <Box
                    width="full"
                    p={6}
                    borderBottomWidth="1px"
                >
                    <Flex align="center">
                        <HStack gap={3}>
                            <Icon fontSize="2xl">
                                <LuNetwork />
                            </Icon>
                            <Box>
                                <Heading size="lg">Cluster Overview</Heading>
                                <Text fontSize="sm" opacity={0.9} mt={0.5}>
                                    Real-time monitoring and information
                                </Text>
                            </Box>
                        </HStack>
                        <Spacer />
                        <Button
                            onClick={() => refetch()}
                            loading={isFetching}
                            size="md"
                            variant="solid"
                        >
                            <LuRefreshCw />
                            Refresh
                        </Button>
                    </Flex>
                </Box>

                {/* Content */}
                <Box p={6}>
                    <VStack gap={6} align="stretch">
                        {/* Cluster Overview Stats */}
                        <Box>
                            <HStack mb={4} gap={2}>
                                <Icon fontSize="lg" color="blue.500">
                                    <LuDatabase />
                                </Icon>
                                <Heading size="md" color="fg.emphasized">
                                    Cluster Metrics
                                </Heading>
                            </HStack>
                            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={5}>
                                <Card.Root
                                    variant="elevated"
                                    _hover={{
                                        transform: "translateY(-2px)",
                                        shadow: "lg",
                                        transition: "all 0.2s"
                                    }}
                                    transition="all 0.2s"
                                >
                                    <Card.Body>
                                        <Stat.Root colorPalette="blue" size="lg">
                                            <HStack justify="space-between" mb={3}>
                                                <Box
                                                    p={2}
                                                    borderRadius="lg"
                                                    bg="blue.100"
                                                    color="blue.700"
                                                    _dark={{
                                                        bg: "blue.900",
                                                        color: "blue.200"
                                                    }}
                                                >
                                                    <Icon fontSize="xl"><LuNetwork /></Icon>
                                                </Box>
                                                <Badge colorPalette="blue" variant="subtle" size="sm">
                                                    Live
                                                </Badge>
                                            </HStack>
                                            <Stat.Label>Cluster ID</Stat.Label>
                                            <Tooltip
                                                openDelay={300}
                                                content={
                                                    <Box>
                                                        <Text fontFamily="mono" fontSize="sm">{clusterInfo.cluster_id}</Text>
                                                        <Text fontSize="xs" color="fg.muted" mt={1}>点击可复制</Text>
                                                    </Box>
                                                }
                                            >
                                                <Stat.ValueText
                                                    fontFamily="mono"
                                                    cursor="pointer"
                                                    overflow="hidden"
                                                    textOverflow="ellipsis"
                                                    whiteSpace="nowrap"
                                                    maxWidth="100%"
                                                    display="block"
                                                    onClick={() => handleCopyClusterId(clusterInfo.cluster_id)}
                                                    _hover={{ color: "blue.500" }}
                                                >
                                                    {clusterInfo.cluster_id}
                                                </Stat.ValueText>
                                            </Tooltip>
                                        </Stat.Root>
                                    </Card.Body>
                                </Card.Root>

                                <Card.Root
                                    variant="elevated"
                                    _hover={{
                                        transform: "translateY(-2px)",
                                        shadow: "lg",
                                        transition: "all 0.2s"
                                    }}
                                    transition="all 0.2s"
                                >
                                    <Card.Body>
                                        <Stat.Root colorPalette="green" size="lg">
                                            <HStack justify="space-between" mb={3}>
                                                <Box
                                                    p={2}
                                                    borderRadius="lg"
                                                    bg="green.100"
                                                    color="green.700"
                                                    _dark={{
                                                        bg: "green.900",
                                                        color: "green.200"
                                                    }}
                                                >
                                                    <Icon fontSize="xl"><LuUsers /></Icon>
                                                </Box>
                                                <Badge colorPalette="green" variant="subtle" size="sm">
                                                    Live
                                                </Badge>
                                            </HStack>
                                            <Stat.Label>Members</Stat.Label>
                                            <Stat.ValueText>{clusterInfo.members.length}</Stat.ValueText>
                                        </Stat.Root>
                                    </Card.Body>
                                </Card.Root>

                                <Card.Root
                                    variant="elevated"
                                    _hover={{
                                        transform: "translateY(-2px)",
                                        shadow: "lg",
                                        transition: "all 0.2s"
                                    }}
                                    transition="all 0.2s"
                                >
                                    <Card.Body>
                                        <Stat.Root colorPalette="purple" size="lg">
                                            <HStack justify="space-between" mb={3}>
                                                <Box
                                                    p={2}
                                                    borderRadius="lg"
                                                    bg="purple.100"
                                                    color="purple.700"
                                                    _dark={{
                                                        bg: "purple.900",
                                                        color: "purple.200"
                                                    }}
                                                >
                                                    <Icon fontSize="xl"><LuDatabase /></Icon>
                                                </Box>
                                                <Badge colorPalette="purple" variant="subtle" size="sm">
                                                    Live
                                                </Badge>
                                            </HStack>
                                            <Stat.Label>Database Size</Stat.Label>
                                            <HStack gap={1} align="baseline">
                                                <Stat.ValueText>{dbSize.value}</Stat.ValueText>
                                                <Stat.ValueUnit>{dbSize.unit}</Stat.ValueUnit>
                                            </HStack>
                                        </Stat.Root>
                                    </Card.Body>
                                </Card.Root>

                                <Card.Root
                                    variant="elevated"
                                    _hover={{
                                        transform: "translateY(-2px)",
                                        shadow: "lg",
                                        transition: "all 0.2s"
                                    }}
                                    transition="all 0.2s"
                                >
                                    <Card.Body>
                                        <Stat.Root colorPalette="orange" size="lg">
                                            <HStack justify="space-between" mb={3}>
                                                <Box
                                                    p={2}
                                                    borderRadius="lg"
                                                    bg="orange.100"
                                                    color="orange.700"
                                                    _dark={{
                                                        bg: "orange.900",
                                                        color: "orange.200"
                                                    }}
                                                >
                                                    <Icon fontSize="xl"><LuServer /></Icon>
                                                </Box>
                                                <Badge colorPalette="orange" variant="subtle" size="sm">
                                                    Live
                                                </Badge>
                                            </HStack>
                                            <Stat.Label>ETCD Version</Stat.Label>
                                            <Stat.ValueText>{clusterInfo.version}</Stat.ValueText>
                                        </Stat.Root>
                                    </Card.Body>
                                </Card.Root>
                            </SimpleGrid>
                        </Box>

                        {/* Raft Information */}
                        <Card.Root variant="elevated" shadow="md">
                            <Card.Header
                            >
                                <HStack gap={2}>
                                    <Icon fontSize="lg" color="blue.500">
                                        <LuGitBranch />
                                    </Icon>
                                    <Heading size="md">Raft Consensus Protocol</Heading>
                                </HStack>
                            </Card.Header>
                            <Card.Body p={4}>
                                <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
                                    <Box
                                        p={4}
                                        borderRadius="lg"
                                        bg="gray.contrast"
                                        borderWidth="1px"
                                    >
                                        <Stat.Root colorPalette="blue" size="md">
                                            <Stat.Label>Raft Index</Stat.Label>
                                            <Stat.ValueText>{clusterInfo.raft_index}</Stat.ValueText>
                                        </Stat.Root>
                                    </Box>
                                    <Box
                                        p={4}
                                        borderRadius="lg"
                                        bg="gray.contrast"
                                        borderWidth="1px"
                                    >
                                        <Stat.Root colorPalette="purple" size="md">
                                            <Stat.Label>Raft Term</Stat.Label>
                                            <Stat.ValueText>{clusterInfo.raft_term}</Stat.ValueText>
                                        </Stat.Root>
                                    </Box>
                                    <Box
                                        p={4}
                                        borderRadius="lg"
                                        bg="gray.contrast"
                                        borderWidth="1px"
                                    >
                                        <Stat.Root colorPalette="green" size="md">
                                            <HStack justify="space-between" mb={2}>
                                                <Stat.Label>Current Leader</Stat.Label>
                                                <Icon color="green.fg">
                                                    <LuShield />
                                                </Icon>
                                            </HStack>
                                            <HStack gap={2} align="baseline">
                                                <Stat.ValueText>{leaderMember?.name || clusterInfo.leader}</Stat.ValueText>
                                                <Badge colorPalette="green" variant="solid" size="sm">
                                                    Active
                                                </Badge>
                                            </HStack>
                                        </Stat.Root>
                                    </Box>
                                </SimpleGrid>
                            </Card.Body>
                        </Card.Root>

                        {/* Members Table */}
                        <Card.Root variant="elevated" shadow="md">
                            <Card.Header>
                                <HStack gap={2}>
                                    <Icon fontSize="lg" color="green.500">
                                        <LuUsers />
                                    </Icon>
                                    <Heading size="md" color="fg.emphasized">
                                        Cluster Members
                                    </Heading>
                                    <Badge colorPalette="green" variant="subtle">
                                        {clusterInfo.members.length} Active
                                    </Badge>
                                </HStack>
                            </Card.Header>
                            <Card.Body p={2}>
                                <Table.Root size="md">
                                    <Table.Header bg="gray.subtle">
                                        <Table.Row>
                                            <Table.ColumnHeader fontWeight="bold">
                                                <HStack gap={2}>
                                                    <Icon fontSize="sm"><LuShield /></Icon>
                                                    <Text>Member ID</Text>
                                                </HStack>
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader fontWeight="bold">
                                                <HStack gap={2}>
                                                    <Icon fontSize="sm"><LuServer /></Icon>
                                                    <Text>Name</Text>
                                                </HStack>
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader fontWeight="bold">
                                                <HStack gap={2}>
                                                    <Icon fontSize="sm"><LuGlobe /></Icon>
                                                    <Text>Peer URLs</Text>
                                                </HStack>
                                            </Table.ColumnHeader>
                                            <Table.ColumnHeader fontWeight="bold">
                                                <HStack gap={2}>
                                                    <Icon fontSize="sm"><LuGlobe /></Icon>
                                                    <Text>Client URLs</Text>
                                                </HStack>
                                            </Table.ColumnHeader>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {clusterInfo.members.map((member) => (
                                            <Table.Row key={member.id}>
                                                <Table.Cell>
                                                    <HStack gap={2}>
                                                        <Box
                                                            w={2}
                                                            h={2}
                                                            borderRadius="full"
                                                            bg={member.id === clusterInfo.leader ? "green" : "blue"}
                                                        />
                                                        <Text fontFamily="mono" fontSize="sm" fontWeight="medium">
                                                            {member.id}
                                                        </Text>
                                                    </HStack>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <VStack align="start" gap={1}>
                                                        <HStack gap={2}>
                                                            <Text fontWeight="semibold" fontSize="sm">
                                                                {member.name || "(unnamed)"}
                                                            </Text>
                                                        </HStack>
                                                        {member.id === clusterInfo.leader && (
                                                            <Badge colorPalette="green" variant="solid" size="xs">
                                                                <Icon fontSize="xs" mr={0.5}><LuShield /></Icon>
                                                                Leader
                                                            </Badge>
                                                        )}
                                                        {member.id === clusterInfo.member_id && (
                                                            <Badge colorPalette="blue" variant="solid" size="xs">
                                                                Connected
                                                            </Badge>
                                                        )}
                                                    </VStack>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <VStack align="start" gap={1.5}>
                                                        {member.peer_urls.map((url, idx) => (
                                                            <Box
                                                                key={idx}
                                                                px={2}
                                                                py={1}
                                                                borderRadius="md"
                                                                bg="purple.50"
                                                                borderWidth="1px"
                                                                borderColor="purple.200"
                                                                _dark={{
                                                                    bg: "purple.950",
                                                                    borderColor: "purple.800"
                                                                }}
                                                            >
                                                                <Text fontFamily="mono" fontSize="xs" color="purple.700" _dark={{ color: "purple.300" }}>
                                                                    {url}
                                                                </Text>
                                                            </Box>
                                                        ))}
                                                    </VStack>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <VStack align="start" gap={1.5}>
                                                        {member.client_urls.map((url, idx) => (
                                                            <Box
                                                                key={idx}
                                                                px={2}
                                                                py={1}
                                                                borderRadius="md"
                                                                bg="blue.50"
                                                                borderWidth="1px"
                                                                borderColor="blue.200"
                                                                _dark={{
                                                                    bg: "blue.950",
                                                                    borderColor: "blue.800"
                                                                }}
                                                            >
                                                                <Text fontFamily="mono" fontSize="xs" color="blue.700" _dark={{ color: "blue.300" }}>
                                                                    {url}
                                                                </Text>
                                                            </Box>
                                                        ))}
                                                    </VStack>
                                                </Table.Cell>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table.Root>
                            </Card.Body>
                        </Card.Root>

                    </VStack>
                </Box>
            </Flex>
        </Flex>
    );
}

export default Cluster;
