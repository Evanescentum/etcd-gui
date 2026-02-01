import { useState, useEffect } from "react";
import {
    Box,
    Flex,
    IconButton,
    Button,
    Portal,
    Combobox,
    ScrollArea,
    useListCollection,
    useFilter,
} from "@chakra-ui/react";
import { LuFolder, LuRefreshCw, LuX } from "react-icons/lu";
import { codeInputProps } from "@/utils/inputProps";
import { savePathToHistory, getPathHistory, deletePathFromHistory } from "../api/etcd";

interface PathInputProps {
    /** Current path prefix value */
    value: string;
    /** Callback when path value changes */
    onChange: (value: string) => void;
    /** Current profile name for history management */
    profileName: string;
    /** Callback when refresh is triggered */
    onRefresh: () => void;
    /** Whether the refresh button should show loading state */
    loading?: boolean;
    /** Placeholder text for the input */
    placeholder?: string;
}

function PathInput({
    value,
    onChange,
    profileName,
    onRefresh,
    loading = false,
    placeholder = "Key prefix"
}: PathInputProps) {
    // Path history state
    const [pathHistory, setPathHistory] = useState<string[]>([]);

    // Path history filter using Chakra UI hooks
    const { startsWith } = useFilter({ sensitivity: "base" });
    const { collection: pathHistoryCollection, filter: filterPathHistory, set: setPathHistoryItems } = useListCollection({
        initialItems: [] as { label: string; value: string }[],
        filter: startsWith,
    });

    // Update collection when pathHistory changes
    useEffect(() => {
        setPathHistoryItems(pathHistory.map(path => ({ label: path, value: path })));
    }, [pathHistory, setPathHistoryItems]);

    // Load path history on mount and when profile changes
    useEffect(() => {
        async function loadPathHistory() {
            try {
                const history = await getPathHistory(profileName);
                setPathHistory(history);
            } catch (error) {
                console.error('Failed to load path history:', error);
            }
        }
        loadPathHistory();
    }, [profileName]);

    // Handle path selection from combobox
    const handlePathValueChange = async (details: Combobox.ValueChangeDetails) => {
        const selectedPath = details.value[0];
        if (selectedPath) {
            onChange(selectedPath);
            const updatedHistory = await savePathToHistory(selectedPath, profileName);
            setPathHistory(updatedHistory);
            onRefresh();
        }
    };

    // Handle path input change
    const handlePathInputChange = (details: Combobox.InputValueChangeDetails) => {
        onChange(details.inputValue);
        filterPathHistory(details.inputValue);
    };

    // Handle delete path from history
    const handleDeletePathFromHistory = async (e: React.MouseEvent, pathToDelete: string) => {
        e.stopPropagation(); // Prevent selecting the item when clicking delete
        e.preventDefault();
        try {
            const updatedHistory = await deletePathFromHistory(pathToDelete, profileName);
            setPathHistory(updatedHistory);
        } catch (error) {
            console.error('Failed to delete path from history:', error);
        }
    };

    // Handle manual refresh with history save
    const handleRefresh = async () => {
        if (value !== "") {
            const updatedHistory = await savePathToHistory(value, profileName);
            setPathHistory(updatedHistory);
        }
        onRefresh();
    };

    return (
        <Flex width="full" align="center" gap={2} position="relative">
            <Box borderWidth="1px" borderRadius="md" p={2}><LuFolder /></Box>
            <Combobox.Root
                collection={pathHistoryCollection}
                allowCustomValue
                inputValue={value}
                onInputValueChange={handlePathInputChange}
                onValueChange={handlePathValueChange}
                openOnClick
                selectionBehavior="replace"
                flex="1"
            >
                <Combobox.Control>
                    <Combobox.Input
                        {...codeInputProps}
                        placeholder={placeholder}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.defaultPrevented) {
                                handleRefresh();
                            }
                        }}
                    />
                    <Combobox.IndicatorGroup>
                        <Combobox.Trigger />
                    </Combobox.IndicatorGroup>
                </Combobox.Control>
                <Portal>
                    <Combobox.Positioner>
                        <Combobox.Content boxShadow="2xl">
                            <ScrollArea.Root maxH="15rem">
                                <ScrollArea.Viewport>
                                    <ScrollArea.Content>
                                        <Combobox.Empty>No history</Combobox.Empty>
                                        {pathHistoryCollection.items.map((item) => (
                                            <Combobox.Item key={item.value} item={item}>
                                                <Combobox.ItemText fontFamily="mono" fontSize="sm" flex="1">
                                                    {item.label}
                                                </Combobox.ItemText>
                                                <IconButton
                                                    marginEnd={2}
                                                    size="sm"
                                                    variant="ghost"
                                                    colorPalette="red"
                                                    onClick={(e) => handleDeletePathFromHistory(e, item.value)}
                                                >
                                                    <LuX />
                                                </IconButton>
                                            </Combobox.Item>
                                        ))}
                                    </ScrollArea.Content>
                                </ScrollArea.Viewport>
                                <ScrollArea.Scrollbar />
                            </ScrollArea.Root>
                        </Combobox.Content>
                    </Combobox.Positioner>
                </Portal>
            </Combobox.Root>

            <Button onClick={handleRefresh} loading={loading} width="7rem">
                <LuRefreshCw />Refresh
            </Button>
        </Flex>
    );
}

export default PathInput;
