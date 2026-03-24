import { useMemo, useState, useEffect } from "react";
import { Button, CloseButton, Dialog, Field, Text, VStack, IconButton, HStack, Box, Table, Flex, Heading, Spinner, Select, Portal, SegmentGroup, createListCollection } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toaster } from "../ui/toaster";
import { LuCheck, LuCopy, LuHistory, LuChevronLeft, LuChevronRight, LuChevronsRight } from "react-icons/lu";
import { EtcdItem, getKeyAtRevision } from "../../api/etcd";
import { useDebounce } from "use-debounce";
import AnnotatedText from "../AnnotatedText";
import PathSelectionButton from "../PathSelectionButton";
import CodeViewer from "../CodeViewer";
import { detectLanguage, type DetectedLanguage } from "../../utils/languageDetect";

interface ViewValueDialogProps {
    keyToView: string;
    valueToView: string;
    item?: EtcdItem;
    onClose: () => void;
    onNavigate?: (path: string) => void;
}

type CopyTarget = "main" | "history" | null;
type DisplayMode = "pretty" | "raw";

const displayModeOptions = [
    { label: "Pretty", value: "pretty" },
    { label: "Raw", value: "raw" },
];

function ViewValueDialog({ keyToView, valueToView, item, onClose, onNavigate }: ViewValueDialogProps) {
    const [showHistory, setShowHistory] = useState(false);
    const [historyStack, setHistoryStack] = useState<EtcdItem[]>([]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showSpinner] = useDebounce(loadingHistory, 200);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null);
    const [languageOverride, setLanguageOverride] = useState<DetectedLanguage | null>(null);
    const [displayMode, setDisplayMode] = useState<DisplayMode>("pretty");
    const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null);

    // Initialize history stack with current item
    useEffect(() => {
        if (item) {
            setHistoryStack([item]);
            setHistoryIndex(0);
        }
    }, [item]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        if (!copiedTarget) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCopiedTarget(null);
        }, 1400);

        return () => window.clearTimeout(timer);
    }, [copiedTarget]);

    const handleTextSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            setSelectedPath(null);
            setButtonPosition(null);
            return;
        }

        const selectedText = selection.toString().trim();
        if (selectedText.startsWith('/') && selectedText.length > 1) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setButtonPosition({
                x: rect.right + 8,
                y: rect.top - 36,
            });
            setSelectedPath(selectedText);
        } else {
            setSelectedPath(null);
            setButtonPosition(null);
        }
    };

    const currentHistoryItem = historyStack[historyIndex];

    const detected = useMemo(() => detectLanguage(valueToView), [valueToView]);
    const historyDetected = useMemo(
        () => currentHistoryItem ? detectLanguage(currentHistoryItem.value) : null,
        [currentHistoryItem],
    );
    const language = languageOverride ?? detected.language;
    const prettyValue = useMemo(() => {
        if (!languageOverride || languageOverride === detected.language) return detected.formatted;
        return valueToView;
    }, [languageOverride, detected, valueToView]);

    const displayedValue = displayMode === "pretty" ? prettyValue : valueToView;
    const displayedHistoryValue = useMemo(() => {
        if (!currentHistoryItem) {
            return "";
        }

        if (displayMode === "raw") {
            return currentHistoryItem.value;
        }

        if (historyDetected && (!languageOverride || languageOverride === historyDetected.language)) {
            return historyDetected.formatted;
        }

        return currentHistoryItem.value;
    }, [currentHistoryItem, displayMode, historyDetected, languageOverride]);

    const handleCopyValue = async (text: string, target: Exclude<CopyTarget, null>) => {
        try {
            await writeText(text);
            setCopiedTarget(target);
        } catch (error) {
            toaster.create({
                title: "Copy failed",
                description: "Unable to copy to clipboard",
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

    const languageLabels: Record<DetectedLanguage, string> = {
        json: "JSON",
        yaml: "YAML",
        xml: "XML",
        toml: "TOML",
        plaintext: "Plain Text",
    };

    const languageCollection = useMemo(() => createListCollection({
        items: (["json", "yaml", "xml", "toml", "plaintext"] as DetectedLanguage[]).map((lang) => ({
            label: `${languageLabels[lang]}${lang === detected.language ? " (auto)" : ""}`,
            value: lang,
        })),
    }), [detected.language]);

    return (
        <Dialog.Root open size="xl">
            <Dialog.Backdrop onClick={onClose} />
            <Dialog.Positioner>
                <Dialog.Content bg="transparent" shadow="none" maxW="max-content">
                    <Flex align="start" gap={4} justify="center">
                        {/* Main View Window */}
                        <Box
                            bg="bg.panel"
                            shadow="lg"
                            borderRadius="xl"
                            width={showHistory ? "38rem" : "50rem"}
                            maxH="calc(100vh - 8rem)"
                            transition="width 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                            position="relative"
                            borderWidth="1px"
                        >
                            <Dialog.Header p={4} width="100%" display="inline-flex" justifyContent="space-between">
                                <Dialog.Title>View Value</Dialog.Title>
                                <CloseButton size="sm" onClick={onClose}> <HiX /></CloseButton>
                            </Dialog.Header>
                            <Dialog.Body marginTop={0} pb={4} overflowY="auto">
                                <Field.Root>
                                    <Field.Label>Key</Field.Label>
                                    <AnnotatedText width="100%" text={keyToView} borderWidth="1px" borderRadius="md" padding={2} fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere" />
                                </Field.Root>
                                <Field.Root marginTop={2} maxHeight="50vh">
                                    <HStack placeSelf="stretch" justify="space-between">
                                        <Field.Label>Value</Field.Label>
                                        <HStack gap={1}>
                                            <SegmentGroup.Root
                                                size="xs"
                                                value={displayMode}
                                                onValueChange={(e) => setDisplayMode(e.value as DisplayMode)}
                                            >
                                                <SegmentGroup.Indicator />
                                                <SegmentGroup.Items items={displayModeOptions} />
                                            </SegmentGroup.Root>
                                            <Select.Root
                                                collection={languageCollection}
                                                value={[language]}
                                                onValueChange={(e) => {
                                                    const val = e.value[0] as DetectedLanguage;
                                                    setLanguageOverride(val === detected.language ? null : val);
                                                }}
                                                positioning={{ strategy: "fixed" }}
                                                size="xs"
                                                width="7rem"
                                            >
                                                <Select.HiddenSelect />
                                                <Select.Control>
                                                    <Select.Trigger>
                                                        <Select.ValueText />
                                                    </Select.Trigger>
                                                    <Select.IndicatorGroup>
                                                        <Select.Indicator />
                                                    </Select.IndicatorGroup>
                                                </Select.Control>
                                                <Portal>
                                                    <Select.Positioner>
                                                        <Select.Content zIndex={1600}>
                                                            {languageCollection.items.map((item) => (
                                                                <Select.Item item={item} key={item.value}>
                                                                    {item.label}
                                                                    <Select.ItemIndicator />
                                                                </Select.Item>
                                                            ))}
                                                        </Select.Content>
                                                    </Select.Positioner>
                                                </Portal>
                                            </Select.Root>
                                            <IconButton
                                                size="sm"
                                                variant="subtle"
                                                aria-label={copiedTarget === "main" ? "Copied value" : "Copy value"}
                                                colorPalette={copiedTarget === "main" ? "green" : undefined}
                                                transition="background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease"
                                                onClick={() => handleCopyValue(displayedValue, "main")}
                                            >
                                                <Box
                                                    as="span"
                                                    display="inline-flex"
                                                    alignItems="center"
                                                    justifyContent="center"
                                                    transition="transform 0.18s ease, opacity 0.18s ease"
                                                    transform={copiedTarget === "main" ? "scale(1)" : "scale(0.92)"}
                                                    opacity={1}
                                                >
                                                    {copiedTarget === "main" ? <LuCheck /> : <LuCopy />}
                                                </Box>
                                            </IconButton>
                                        </HStack>
                                    </HStack>
                                    <Box
                                        borderWidth="1px"
                                        borderRadius="md"
                                        padding={2}
                                        width="100%"
                                        overflowY="auto"
                                        onMouseUp={handleTextSelection}
                                        onScroll={() => {
                                            setSelectedPath(null);
                                            setButtonPosition(null);
                                        }}
                                    >
                                        <CodeViewer code={displayedValue} language={language} />
                                    </Box>
                                </Field.Root>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button onClick={onClose}>Close</Button>
                            </Dialog.Footer>

                            {/* Path Selection Button */}
                            {selectedPath && buttonPosition && onNavigate && (
                                <PathSelectionButton
                                    selectedText={selectedPath}
                                    position={buttonPosition}
                                    onNavigate={(path) => {
                                        onNavigate(path);
                                        onClose();
                                    }}
                                />
                            )}

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
                            width={showHistory ? "25rem" : "0rem"}
                            opacity={showHistory ? 1 : 0}
                            borderWidth={showHistory ? "1px" : "0px"}
                            maxH="calc(100vh - 8rem)"
                        >
                            <Box p={3}>
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
                                    <VStack align="stretch" gap={2}>
                                        {/* Navigation Bar */}
                                        <HStack justify="space-between" bg="bg.subtle" p={2} borderRadius="md">
                                            <IconButton size="sm" onClick={handleOlder}
                                                disabled={loadingHistory || currentHistoryItem.mod_revision === currentHistoryItem.create_revision}
                                            >
                                                <LuChevronLeft />
                                            </IconButton>

                                            <VStack gap={0}>
                                                <Text fontSize="xs" fontWeight="bold" color="fg.muted">Revision</Text>
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

                                        {/* Metadata Table */}

                                        <Text fontSize="xs" color="fg.muted" fontWeight="bold">Metadata</Text>
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

                                        {/* Value Display */}
                                        <HStack justify="space-between">
                                            <Text fontSize="xs" color="fg.muted" fontWeight="bold">Value</Text>
                                            <IconButton
                                                size="xs"
                                                variant="ghost"
                                                aria-label={copiedTarget === "history" ? "Copied historical value" : "Copy historical value"}
                                                colorPalette={copiedTarget === "history" ? "green" : undefined}
                                                transition="background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease"
                                                onClick={() => handleCopyValue(displayedHistoryValue, "history")}
                                            >
                                                <Box
                                                    as="span"
                                                    display="inline-flex"
                                                    alignItems="center"
                                                    justifyContent="center"
                                                    transition="transform 0.18s ease, opacity 0.18s ease"
                                                    transform={copiedTarget === "history" ? "scale(1)" : "scale(0.92)"}
                                                    opacity={1}
                                                >
                                                    {copiedTarget === "history" ? <LuCheck /> : <LuCopy />}
                                                </Box>
                                            </IconButton>
                                        </HStack>
                                        <Box maxHeight="30vh" overflowY="auto" borderWidth="1px" borderRadius="md" p={3} bg="bg.subtle" position="relative">
                                            {loadingHistory && showSpinner && (
                                                <Flex position="absolute" inset={0} bg="whiteAlpha.800" align="center" justify="center" zIndex={1}>
                                                    <Spinner size="sm" />
                                                </Flex>
                                            )}
                                            <CodeViewer code={displayedHistoryValue} language={language} />
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
