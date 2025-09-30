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
} from "@chakra-ui/react";
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
import type { AppConfig } from "../api/etcd";
import { useClusterInfoQuery } from "../hooks/useEtcdQuery";

interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    colorPalette?: string;
}

const StatCard = ({ label, value, icon, colorPalette = "blue" }: StatCardProps) => {
    return (
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
                <Flex direction="column" gap={3}>
                    <HStack justify="space-between">
                        <Box
                            p={2}
                            borderRadius="lg"
                            bg={`${colorPalette}.100`}
                            color={`${colorPalette}.700`}
                            _dark={{
                                bg: `${colorPalette}.900`,
                                color: `${colorPalette}.200`
                            }}
                        >
                            <Icon fontSize="xl">{icon}</Icon>
                        </Box>
                        <Badge
                            colorPalette={colorPalette}
                            variant="subtle"
                            size="sm"
                        >
                            Live
                        </Badge>
                    </HStack>
                    <Box>
                        <Text fontSize="xs" color="fg.muted" mb={1} fontWeight="medium" textTransform="uppercase" letterSpacing="wider">
                            {label}
                        </Text>
                        <Text fontSize="3xl" fontWeight="bold" lineHeight="1.2" color="fg.emphasized">
                            {value}
                        </Text>
                    </Box>
                </Flex>
            </Card.Body>
        </Card.Root>
    );
};

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

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    };

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
                                <StatCard
                                    label="Cluster ID"
                                    value={clusterInfo.cluster_id}
                                    icon={<LuNetwork />}
                                    colorPalette="blue"
                                />
                                <StatCard
                                    label="Members"
                                    value={clusterInfo.members.length}
                                    icon={<LuUsers />}
                                    colorPalette="green"
                                />
                                <StatCard
                                    label="Database Size"
                                    value={formatBytes(clusterInfo.db_size)}
                                    icon={<LuDatabase />}
                                    colorPalette="purple"
                                />
                                <StatCard
                                    label="ETCD Version"
                                    value={clusterInfo.version}
                                    icon={<LuServer />}
                                    colorPalette="orange"
                                />
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
                                        <Text fontSize="xs" color="fg.muted" mb={2} fontWeight="medium" textTransform="uppercase">
                                            Raft Index
                                        </Text>
                                        <Text fontSize="2xl" fontWeight="bold" color="blue.solid">
                                            {clusterInfo.raft_index}
                                        </Text>
                                    </Box>
                                    <Box
                                        p={4}
                                        borderRadius="lg"
                                        bg="gray.contrast"
                                        borderWidth="1px"
                                    >
                                        <Text fontSize="xs" color="fg.muted" mb={2} fontWeight="medium" textTransform="uppercase">
                                            Raft Term
                                        </Text>
                                        <Text fontSize="2xl" fontWeight="bold" color="purple.fg">
                                            {clusterInfo.raft_term}
                                        </Text>
                                    </Box>
                                    <Box
                                        p={4}
                                        borderRadius="lg"
                                        bg="gray.contrast"
                                        borderWidth="1px"
                                    >
                                        <HStack justify="space-between" mb={2}>
                                            <Text fontSize="xs" color="fg.muted" fontWeight="medium" textTransform="uppercase">
                                                Current Leader
                                            </Text>
                                            <Icon color="green.fg">
                                                <LuShield />
                                            </Icon>
                                        </HStack>
                                        <HStack gap={2}>
                                            <Text fontSize="xl" fontWeight="bold" color="green.solid">
                                                {leaderMember?.name || clusterInfo.leader}
                                            </Text>
                                            <Badge colorPalette="green" variant="solid" size="sm">
                                                Active
                                            </Badge>
                                        </HStack>
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
