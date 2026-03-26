import { useState, useEffect, useRef, useMemo, memo, useDeferredValue, useSyncExternalStore } from "react";
import {
    Box,
    Heading,
    Text,
    Button,
    HStack,
    Spinner,
    Badge,
    ScrollArea,
    IconButton,
    Flex,
    Spacer,
    EmptyState,
    Input,
    InputGroup,
    createListCollection,
    Select,
    Portal,
} from "@chakra-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { codeInputProps } from "@/utils/inputProps";
import { LuTriangleAlert, LuPause, LuPlay, LuTrash2, LuArrowDown, LuBrackets, LuSearch, LuFolderOpen } from "react-icons/lu";
import { useDebounce } from "use-debounce";
import { openLogFolder } from "@/api/etcd";
import { toaster } from "../ui/toaster";
import { logStore, type LogEntry } from "@/stores/log-store";

const LogItem = memo(({ entry }: { entry: LogEntry }) => {
    const parsed = entry.parsed;

    if (!parsed) {
        return (
            <Box minH="1.2em" whiteSpace="pre-wrap" wordBreak="break-all" overflowWrap="anywhere" fontFamily="mono" width="full">
                {entry.raw}
            </Box>
        );
    }

    const { date, time, level, target, location, message } = parsed;

    const levelColor = {
        INFO: "green",
        WARN: "orange",
        ERROR: "red",
        DEBUG: "blue",
        TRACE: "gray",
    }[level] || "gray";

    return (
        <Box
            width="full"
            maxW="full"
            minW="0"
            py={0.5}
            fontFamily="mono"
            whiteSpace="pre-wrap"
            wordBreak="normal"
            overflowWrap="anywhere"
            lineHeight="1.6"
        >
            <Text as="span" color="fg.muted" fontSize="xs">
                {date} {time}
            </Text>{" "}
            <Badge
                as="span"
                size="xs"
                colorPalette={levelColor}
                variant="subtle"
                justifyContent="center"
                verticalAlign="text-bottom"
                mx={0.5}
            >
                {level}
            </Badge>{" "}
            <Text as="span" color="fg.subtle" fontSize="xs" fontWeight="bold">
                [{target}]
            </Text>{" "}
            <Text as="span" color="fg.muted" fontSize="xs">
                [{location}]
            </Text>{" "}
            <Text as="span" color={level === "ERROR" ? "red.fg" : "fg.default"}>
                {message}
            </Text>
        </Box>
    );
});


function Logs() {
    const { logs, isWatching, error } = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot);
    const [filterQuery, setFilterQuery] = useState("");
    const [filterLevel, setFilterLevel] = useState("ALL");
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [debouncedFilterQuery] = useDebounce(filterQuery, 300);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const isAtBottomRef = useRef(true);
    const deferredLogs = useDeferredValue(logs);

    const levelCollection = createListCollection({
        items: [
            { label: "All Levels", value: "ALL" },
            { label: "INFO", value: "INFO" },
            { label: "WARN", value: "WARN" },
            { label: "ERROR", value: "ERROR" },
            { label: "DEBUG", value: "DEBUG" },
            { label: "TRACE", value: "TRACE" },
        ]
    });

    const filteredLogs = useMemo(() => {
        let result = deferredLogs;

        // Filter by level
        if (filterLevel !== "ALL") {
            result = result.filter(log => log.parsed?.level === filterLevel);
        }

        // Filter by query
        if (debouncedFilterQuery) {
            const lowerQuery = debouncedFilterQuery.toLowerCase();
            result = result.filter(log => log.lower.includes(lowerQuery));
        }

        return result;
    }, [deferredLogs, debouncedFilterQuery, filterLevel]);

    const rowVirtualizer = useVirtualizer({
        count: filteredLogs.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => 32,
        overscan: 12,
        getItemKey: (index) => filteredLogs[index]?.id ?? index,
    });

    const handleViewportScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const viewport = event.currentTarget;
        const nextIsAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
        isAtBottomRef.current = nextIsAtBottom;
        setIsAtBottom((current) => (current === nextIsAtBottom ? current : nextIsAtBottom));
    };

    const scrollToBottom = () => {
        if (filteredLogs.length === 0) return;
        rowVirtualizer.scrollToIndex(filteredLogs.length - 1, { align: "end" });
    };

    useEffect(() => {
        if (!isAtBottomRef.current || filteredLogs.length === 0) return;

        const frameId = requestAnimationFrame(() => {
            scrollToBottom();
        });

        return () => cancelAnimationFrame(frameId);
    }, [filteredLogs.length]);

    const handleTogglePause = () => {
        if (isWatching) {
            logStore.stopWatching();
        } else {
            void logStore.startWatching();
        }
    };

    const handleOpenLogFolder = async () => {
        try {
            await openLogFolder();
        } catch {
            toaster.create({
                title: "Error",
                description: "Failed to open log folder",
                type: "error"
            });
        }
    };

    const handleClearLogs = () => {
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        logStore.clear();
    };

    const emptyState = () => {
        return (
            <EmptyState.Root>
                <EmptyState.Content>
                    <EmptyState.Indicator>
                        <LuBrackets size="24px" />
                    </EmptyState.Indicator>
                    <EmptyState.Title>
                        No Logs Yet
                    </EmptyState.Title>
                    <EmptyState.Description>
                        Logs will appear here once generated.
                    </EmptyState.Description>
                </EmptyState.Content>
            </EmptyState.Root>
        )
    }
    return (
        <Flex direction="column" height="100vh" overflow="hidden">
            {/* Header */}
            <Flex
                as="header"
                width="full"
                p={4}
                borderBottomWidth="1px"
                align="center"
                bg="bg.panel"
            >
                <Heading size="md">Log Monitor</Heading>
                <Spacer />
                <Select.Root
                    collection={levelCollection}
                    size="sm"
                    width="120px"
                    value={[filterLevel]}
                    onValueChange={(e) => setFilterLevel(e.value[0])}
                    marginEnd={2}
                >
                    <Select.HiddenSelect />
                    <Select.Control>
                        <Select.Trigger>
                            <Select.ValueText placeholder="Select level" />
                        </Select.Trigger>
                    </Select.Control>
                    <Portal>
                        <Select.Positioner>
                            <Select.Content>
                                {levelCollection.items.map((item) => (
                                    <Select.Item item={item} key={item.value}>
                                        {item.label}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Positioner>
                    </Portal>
                </Select.Root>
                <InputGroup startElement={<LuSearch />} width="250px" marginEnd={4}>
                    <Input
                        {...codeInputProps}
                        size="sm"
                        placeholder="Filter logs..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                    />
                </InputGroup>
                <HStack>
                    {error && (
                        <Badge colorPalette="red" variant="solid">
                            <HStack gap={1}>
                                <LuTriangleAlert size="12px" />
                                <Text>Error</Text>
                            </HStack>
                        </Badge>
                    )}
                    {isWatching && !error && (
                        <Badge colorPalette="green" variant="subtle">
                            <HStack gap={1}>
                                <Spinner size="xs" />
                                <Text>Live</Text>
                            </HStack>
                        </Badge>
                    )}

                    <Button size="xs" variant="outline" onClick={handleTogglePause}>
                        {!isWatching ? <LuPlay /> : <LuPause />}
                        {!isWatching ? "Start" : "Pause"}
                    </Button>
                    <Button size="xs" variant="ghost" colorPalette="red" onClick={handleClearLogs}>
                        <LuTrash2 /> Clear
                    </Button>
                    <Button size="xs" variant="outline" onClick={handleOpenLogFolder}>
                        <LuFolderOpen /> Open Folder
                    </Button>
                </HStack>
            </Flex>

            {/* Error Banner */}
            {error && (
                <Box bg="red.subtle" color="red.fg" p={2} fontSize="sm">
                    <HStack>
                        <LuTriangleAlert />
                        <Text>{error}</Text>
                    </HStack>
                </Box>
            )}

            {/* Log Content */}
            <Box flex="1" overflow="hidden" position="relative" bg="bg.subtle">
                <ScrollArea.Root h="100%" w="100%" variant="always">
                    <ScrollArea.Viewport
                        ref={viewportRef}
                        h="100%"
                        w="100%"
                        onScroll={handleViewportScroll}
                        style={{ contain: "strict", overflowAnchor: "none" }}
                    >
                        <ScrollArea.Content>
                            <Box p={4} color="fg.default" fontFamily="mono" fontSize="sm">
                                {filteredLogs.length === 0 ? (
                                    logs.length === 0 ? emptyState() : (
                                        <Flex direction="column" align="center" justify="center" py={10} color="fg.muted">
                                            <LuSearch size="24px" />
                                            <Text mt={2}>No matching logs found</Text>
                                        </Flex>
                                    )
                                ) : (
                                    <Box height={`${rowVirtualizer.getTotalSize()}px`} position="relative" width="full">
                                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                            const entry = filteredLogs[virtualRow.index];

                                            return (
                                                <Box
                                                    key={virtualRow.key}
                                                    data-index={virtualRow.index}
                                                    ref={rowVirtualizer.measureElement}
                                                    position="absolute"
                                                    top="0"
                                                    left="0"
                                                    width="full"
                                                    transform={`translateY(${virtualRow.start}px)`}
                                                >
                                                    <LogItem entry={entry} />
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                )}
                            </Box>
                        </ScrollArea.Content>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar />
                    <ScrollArea.Corner />
                </ScrollArea.Root>

                {!isAtBottom && (
                    <Box position="absolute" bottom="4" right="4" zIndex="overlay">
                        <IconButton size="sm" onClick={scrollToBottom} rounded="full">
                            <LuArrowDown />
                        </IconButton>
                    </Box>
                )}
            </Box>
        </Flex>
    );
}

export default Logs;
