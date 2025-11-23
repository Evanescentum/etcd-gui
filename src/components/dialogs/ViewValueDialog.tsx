import { useMemo, useState, useEffect } from "react";
import { Button, CloseButton, Dialog, Field, Text, VStack, IconButton, HStack, Box, Table, Flex, Heading, Spinner } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toaster } from "../ui/toaster";
import { LuCopy, LuHistory, LuChevronLeft, LuChevronRight, LuChevronsRight } from "react-icons/lu";
import { EtcdItem, getKeyAtRevision } from "../../api/etcd";
import { useDebounce } from "use-debounce";

interface ViewValueDialogProps {
    keyToView: string;
    valueToView: string;
    item?: EtcdItem;
    onClose: () => void;
}

function ViewValueDialog({ keyToView, valueToView, item, onClose }: ViewValueDialogProps) {
    const [showHistory, setShowHistory] = useState(false);
    const [historyStack, setHistoryStack] = useState<EtcdItem[]>([]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showSpinner] = useDebounce(loadingHistory, 200);

    // Initialize history stack with current item
    useEffect(() => {
        if (item) {
            setHistoryStack([item]);
            setHistoryIndex(0);
        }
    }, [item]);

    const currentHistoryItem = historyStack[historyIndex];

    const { isJson, pretty } = useMemo(() => {
        try {
            const parsed = JSON.parse(valueToView);
            return { isJson: true, pretty: JSON.stringify(parsed, null, 2) };
        } catch {
            return { isJson: false, pretty: valueToView };
        }
    }, [valueToView]);

    const handleCopyValue = async (text: string) => {
        try {
            await writeText(text);
            toaster.create({
                title: "复制成功",
                description: "值已复制到剪贴板",
                type: "success",
                closable: true,
            });
        } catch (error) {
            toaster.create({
                title: "复制失败",
                description: "无法复制到剪贴板",
                type: "error",
                closable: true,
            });
        }
    };

    const handleOlder = async () => {
        if (!currentHistoryItem) return;

        // If we are at the creation revision, there are no older versions
        if (currentHistoryItem.mod_revision === currentHistoryItem.create_revision) {
            toaster.create({ title: "Reached creation revision", description: "This is the first version of the key", type: "info" });
            return;
        }

        const nextIndex = historyIndex + 1;
        // If we already have it in stack
        if (nextIndex < historyStack.length) {
            setHistoryIndex(nextIndex);
            return;
        }

        setLoadingHistory(true);
        try {
            // Fetch the version just before the current one
            const res = await getKeyAtRevision(keyToView, currentHistoryItem.mod_revision - 1);
            if (res) {
                setHistoryStack([...historyStack, res]);
                setHistoryIndex(nextIndex);
            } else {
                toaster.create({ title: "No older version found", type: "info" });
            }
        } catch (e) {
            toaster.create({ title: "Error", description: "Failed to fetch history", type: "error" });
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleNewer = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
        }
    };

    const handleLatest = () => {
        setHistoryIndex(0);
    };

    const textPatternIndicator = isJson ? <Text as="span" fontSize="xs" color="green.500">(JSON, pretty)</Text> : null;

    return (
        <Dialog.Root open size="xl">
            <Dialog.Backdrop onClick={onClose} />
            <Dialog.Positioner>
                <Dialog.Content bg="transparent" shadow="none" maxWidth="none" width="auto" p={0}>
                    <Flex align="start" gap={4} justify="center">
                        {/* Main View Window */}
                        <Box
                            bg="bg.panel"
                            shadow="lg"
                            borderRadius="xl"
                            width={showHistory ? "38rem" : "50rem"}
                            transition="width 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                            position="relative"
                            borderWidth="1px"
                        >
                            <Dialog.Header>
                                <Dialog.Title>View Value</Dialog.Title>
                                <CloseButton position="absolute" right={4} top={4} size="sm" onClick={onClose}>
                                    <HiX />
                                </CloseButton>
                            </Dialog.Header>
                            <Dialog.Body pb={6}>
                                <VStack gap={4} align="stretch">
                                    <Field.Root>
                                        <Field.Label>Key</Field.Label>
                                        <Text borderWidth="1px" borderRadius="md" padding={2} width="100%" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">
                                            {keyToView}
                                        </Text>
                                    </Field.Root>

                                    <Field.Root>
                                        <HStack justify="space-between" align="center" width="100%">
                                            <Field.Label>
                                                Value {textPatternIndicator}
                                            </Field.Label>
                                            <IconButton
                                                size="sm"
                                                variant="subtle"
                                                onClick={() => handleCopyValue(pretty)}
                                                alignSelf="flex-end"
                                            >
                                                <LuCopy />
                                            </IconButton>
                                        </HStack>
                                        <Box
                                            borderWidth="1px"
                                            borderRadius="md"
                                            padding={2}
                                            width="100%"
                                            maxHeight="60vh"
                                            overflowY="auto"
                                        >
                                            <Text fontFamily="mono" fontSize="sm" whiteSpace="pre" overflowWrap="normal" display="block">
                                                {pretty}
                                            </Text>
                                        </Box>
                                    </Field.Root>
                                </VStack>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button onClick={onClose}>Close</Button>
                            </Dialog.Footer>

                            {/* Toggle History Button (Outside) */}
                            {item && !showHistory && (
                                <Box position="absolute" right="-3.5rem" top="0">
                                    <IconButton
                                        aria-label="Show History"
                                        onClick={() => setShowHistory(true)}
                                        size="md"
                                        borderRadius="md"
                                        shadow="sm"
                                    >
                                        <LuHistory />
                                    </IconButton>
                                </Box>
                            )}
                        </Box>

                        {/* History/Metadata Window */}
                        <Box
                            bg="bg.panel"
                            shadow="lg"
                            borderRadius="xl"
                            overflow="hidden"
                            transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                            width={showHistory ? "22rem" : "0rem"}
                            opacity={showHistory ? 1 : 0}
                            borderWidth={showHistory ? "1px" : "0px"}
                            height="auto"
                            minHeight="25rem"
                        >
                            <Box p={4} width="22rem" display={showHistory ? "block" : "none"}>
                                <HStack justify="space-between" mb={4}>
                                    <Heading size="sm">Metadata & History</Heading>
                                    <IconButton
                                        aria-label="Close History"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowHistory(false)}
                                    >
                                        <LuChevronLeft />
                                    </IconButton>
                                </HStack>

                                {currentHistoryItem && (
                                    <VStack align="stretch" gap={6}>
                                        {/* Navigation Bar */}
                                        <Box bg="bg.subtle" p={2} borderRadius="md">
                                            <HStack justify="space-between">
                                                <IconButton
                                                    aria-label="Older"
                                                    size="sm"
                                                    onClick={handleOlder}
                                                    disabled={loadingHistory || currentHistoryItem.mod_revision === currentHistoryItem.create_revision}
                                                >
                                                    <LuChevronLeft />
                                                </IconButton>

                                                <VStack gap={0}>
                                                    <Text fontSize="xs" fontWeight="bold" color="fg.muted">REVISION</Text>
                                                    <Text fontFamily="mono" fontWeight="bold">
                                                        {currentHistoryItem.mod_revision}
                                                        {historyIndex === 0 && <Text as="span" color="green.500" ml={1}>(Latest)</Text>}
                                                    </Text>
                                                </VStack>

                                                <HStack gap={1}>
                                                    <IconButton
                                                        aria-label="Newer"
                                                        size="sm"
                                                        onClick={handleNewer}
                                                        disabled={historyIndex === 0}
                                                    >
                                                        <LuChevronRight />
                                                    </IconButton>
                                                    <IconButton
                                                        aria-label="Latest"
                                                        size="sm"
                                                        onClick={handleLatest}
                                                        disabled={historyIndex === 0}
                                                    >
                                                        <LuChevronsRight />
                                                    </IconButton>
                                                </HStack>
                                            </HStack>
                                        </Box>

                                        {/* Metadata Table */}
                                        <Box>
                                            <Text fontSize="xs" color="fg.muted" mb={2} fontWeight="bold">METADATA</Text>
                                            <Table.Root size="sm" variant="outline" showColumnBorder>
                                                <Table.Body>
                                                    <Table.Row>
                                                        <Table.Cell bg="bg.subtle" fontWeight="medium" width="120px">Version</Table.Cell>
                                                        <Table.Cell fontFamily="mono">{currentHistoryItem.version}</Table.Cell>
                                                    </Table.Row>
                                                    <Table.Row>
                                                        <Table.Cell bg="bg.subtle" fontWeight="medium">Create Rev</Table.Cell>
                                                        <Table.Cell fontFamily="mono">{currentHistoryItem.create_revision}</Table.Cell>
                                                    </Table.Row>
                                                    <Table.Row>
                                                        <Table.Cell bg="bg.subtle" fontWeight="medium">Mod Rev</Table.Cell>
                                                        <Table.Cell fontFamily="mono">{currentHistoryItem.mod_revision}</Table.Cell>
                                                    </Table.Row>
                                                    <Table.Row>
                                                        <Table.Cell bg="bg.subtle" fontWeight="medium">Lease</Table.Cell>
                                                        <Table.Cell fontFamily="mono">{currentHistoryItem.lease}</Table.Cell>
                                                    </Table.Row>
                                                </Table.Body>
                                            </Table.Root>
                                        </Box>

                                        {/* Value Display */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Text fontSize="xs" color="fg.muted" fontWeight="bold">VALUE</Text>
                                                <IconButton size="xs" variant="ghost" onClick={() => handleCopyValue(currentHistoryItem.value)}>
                                                    <LuCopy />
                                                </IconButton>
                                            </HStack>
                                            <Box borderWidth="1px" borderRadius="md" p={3} bg="bg.subtle" position="relative">
                                                {loadingHistory && showSpinner && (
                                                    <Flex position="absolute" inset={0} bg="whiteAlpha.800" align="center" justify="center" zIndex={1}>
                                                        <Spinner size="sm" />
                                                    </Flex>
                                                )}
                                                <Text fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" maxHeight="12rem" overflowY="auto">
                                                    {currentHistoryItem.value}
                                                </Text>
                                            </Box>
                                        </Box>
                                    </VStack>
                                )}
                            </Box>
                        </Box>
                    </Flex>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default ViewValueDialog;
