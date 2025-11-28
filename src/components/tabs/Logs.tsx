import { useState, useEffect, useRef, useMemo, memo } from "react";
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
import { codeInputProps } from "@/utils/inputProps";
import { LuTriangleAlert, LuPause, LuPlay, LuTrash2, LuArrowDown, LuBrackets, LuSearch } from "react-icons/lu";
import { attachLogger } from "@tauri-apps/plugin-log"
import { useStickToBottom } from "use-stick-to-bottom";
import { useDebounce } from "use-debounce";

const LOG_REGEX = /^\[([^\]]*)\]\[([^\]]*)\]\[([^\]]*)\]\[([^\]]*)\]\s+(.*)$/;

const parseLogLine = (line: string) => {
    const match = line.match(LOG_REGEX);
    if (!match) return null;

    const [, date, time, level, target, message] = match;

    return { date, time, level, target, message };
};

const LogItem = memo(({ line }: { line: string }) => {
    const parsed = parseLogLine(line);

    if (!parsed) {
        return (
            <Box minH="1.2em" whiteSpace="pre-wrap" wordBreak="break-all" fontFamily="mono">
                {line}
            </Box>
        );
    }

    const { date, time, level, target, message } = parsed;

    const levelColor = {
        INFO: "green",
        WARN: "orange",
        ERROR: "red",
        DEBUG: "blue",
        TRACE: "gray",
    }[level] || "gray";

    return (
        <HStack align="start" gap={2} minH="1.2em" whiteSpace="pre-wrap" wordBreak="break-all" fontFamily="mono" py={0.5}>
            <Text color="fg.muted" fontSize="xs" whiteSpace="nowrap">
                {date} {time}
            </Text>
            <Badge size="xs" colorPalette={levelColor} variant="subtle" width="10" justifyContent="center">
                {level}
            </Badge>
            <Text color="fg.subtle" fontSize="xs" fontWeight="bold">
                [{target}]
            </Text>
            <Text flex="1" color={level === "ERROR" ? "red.fg" : "fg.default"}>
                {message}
            </Text>
        </HStack>
    );
});


function Logs() {
    const [logs, setLogs] = useState<string[]>([]);
    const [isWatching, setIsWatching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterQuery, setFilterQuery] = useState("");
    const [filterLevel, setFilterLevel] = useState("ALL");
    const [debouncedFilterQuery] = useDebounce(filterQuery, 300);
    const unwatchFnRef = useRef<(() => void) | null>(null);
    const logBufferRef = useRef<string[]>([]);
    const sticky = useStickToBottom();

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
        let result = logs;

        // Filter by level
        if (filterLevel !== "ALL") {
            result = result.filter(log => {
                const parsed = parseLogLine(log);
                return parsed ? parsed.level === filterLevel : false;
            });
        }

        // Filter by query
        if (debouncedFilterQuery) {
            const lowerQuery = debouncedFilterQuery.toLowerCase();
            result = result.filter(log => log.toLowerCase().includes(lowerQuery));
        }

        return result;
    }, [logs, debouncedFilterQuery, filterLevel]);

    const startWatching = async () => {
        if (unwatchFnRef.current) return;

        try {
            setIsWatching(true);
            setError(null);

            // Start watching
            const unwatch = await attachLogger((record) => {
                const newLogLine: string = record.message;
                logBufferRef.current.push(newLogLine);
            })
            console.log("Started log listener");

            unwatchFnRef.current = unwatch;
        } catch (err) {
            console.error("Failed to start watcher:", err);
            setError(`Failed to start file watcher: ${String(err)}`);
            setIsWatching(false);
        }
    };

    // Flush logs buffer periodically
    useEffect(() => {
        const interval = setInterval(() => {
            if (logBufferRef.current.length > 0) {
                setLogs((prevLogs) => {
                    const newLogs = [...prevLogs, ...logBufferRef.current];
                    logBufferRef.current = [];
                    return newLogs;
                });
            }
        }, 100); // Flush every 100ms

        return () => clearInterval(interval);
    }, []);

    const stopWatching = async () => {
        if (unwatchFnRef.current) {
            unwatchFnRef.current();
            unwatchFnRef.current = null;
        }
        setIsWatching(false);
        console.log("Stopped log listener");
    };

    const handleTogglePause = () => {
        if (isWatching) {
            stopWatching();
        } else {
            startWatching();
        }
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
                    <Button size="xs" variant="ghost" colorPalette="red" onClick={() => { setLogs([]); }}>
                        <LuTrash2 /> Clear
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
                    <ScrollArea.Viewport ref={sticky.scrollRef} h="100%" w="100%">
                        <ScrollArea.Content ref={sticky.contentRef}>
                            <Box p={4} color="fg.default" fontFamily="mono" fontSize="sm">
                                {filteredLogs.length === 0 ? (
                                    logs.length === 0 ? emptyState() : (
                                        <Flex direction="column" align="center" justify="center" py={10} color="fg.muted">
                                            <LuSearch size="24px" />
                                            <Text mt={2}>No matching logs found</Text>
                                        </Flex>
                                    )
                                ) : (
                                    filteredLogs.map((line, index) => <LogItem key={index} line={line} />)
                                )}
                            </Box>
                        </ScrollArea.Content>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar />
                    <ScrollArea.Corner />
                </ScrollArea.Root>

                {!sticky.isAtBottom && (
                    <Box position="absolute" bottom="4" right="4" zIndex="overlay">
                        <IconButton size="sm" onClick={() => sticky.scrollToBottom()} rounded="full">
                            <LuArrowDown />
                        </IconButton>
                    </Box>
                )}
            </Box>
        </Flex>
    );
}

export default Logs;
