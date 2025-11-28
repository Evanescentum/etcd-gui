import { useState, useMemo, useEffect, useRef } from "react";
import { useEtcdKeysOnlyQuery, useEtcdValuesInRangeQuery } from "../../hooks/useEtcdQuery";
import {
  Box,
  ButtonGroup,
  CloseButton,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Text,
  VStack,
  Badge,
  Spacer,
  Pagination,
  Table,
  Button,
  Skeleton,
  Status,
  Select,
  Portal,
  createListCollection
} from "@chakra-ui/react";
import { codeInputProps } from "@/utils/inputProps";
import { LuPlus, LuTrash2, LuRefreshCw, LuSearch, LuFolder, LuChevronLeft, LuChevronRight, LuHistory } from "react-icons/lu";
import { TbEdit, TbEye } from "react-icons/tb";
import { Tooltip } from "../../components/ui/tooltip";
import { AppConfig, savePathToHistory, getPathHistory, EtcdItem } from "../../api/etcd";
import AddKeyDialog from "../dialogs/AddKeyDialog";
import DeleteKeyDialog from "../dialogs/DeleteKeyDialog";
import EditKeyDialog from "../dialogs/EditKeyDialog";
import ViewValueDialog from "../dialogs/ViewValueDialog";
import { useDebounce } from "use-debounce";

// Tooltip component for table cells
const TableRowTooltip = ({
  content,
  maxWidth,
  children
}: {
  content: string,
  maxWidth: string,
  children: React.ReactNode
}) => {
  return (
    <Tooltip
      content={<Text fontFamily="mono">{content}</Text>}
      openDelay={200}
      interactive
      contentProps={{
        width: "100%",
        maxWidth,
        bg: "bg.panel",
        color: "fg",
        borderColor: "gray.200"
      }}
    >
      {children}
    </Tooltip>
  );
};

interface DashboardProps {
  configLoading: boolean;
  appConfig: AppConfig;
}

function Dashboard({ configLoading, appConfig }: DashboardProps) {
  const [keyPrefix, setKeyPrefix] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const currentProfileName = useMemo(() => appConfig.current_profile ?? "default", [appConfig]);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const pageSizeCollection = createListCollection({
    items: [
      { label: "5/page", value: "5" },
      { label: "10/page", value: "10" },
      { label: "20/page", value: "20" },
      { label: "50/page", value: "50" },
      { label: "100/page", value: "100" },
    ]
  });
  // Step 1: keys-only list for counts and pagination
  const {
    data: allKeys = [],
    isError: isKeysError,
    error: keysError,
    refetch: refetchKeys,
    isFetching: isFetchingKeys,
  } = useEtcdKeysOnlyQuery({ keyPrefix, currentProfileName, configLoading });

  // Derived filtered keys for search
  const filteredKeys = useMemo(() => {
    if (!searchQuery) return allKeys;
    return allKeys.filter(k => k.includes(searchQuery));
  }, [allKeys, searchQuery]);

  // Pagination slice of keys
  const pageKeys = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredKeys.slice(startIndex, startIndex + pageSize);
  }, [filteredKeys, currentPage, pageSize]);

  // Step 2: fetch values for range [firstKey, lastKey] on the current page
  const firstKey = pageKeys[0];
  const lastKey = pageKeys[pageKeys.length - 1];
  const {
    data: pageRangeItems = [],
    isError: isValuesError,
    error: valuesError,
    refetch: refetchValues,
    isFetching: isFetchingValues,
  } = useEtcdValuesInRangeQuery({ startKey: firstKey, endKey: lastKey, currentProfileName, enabled: !configLoading && pageKeys.length > 0 });
  // Add delayed loading state to prevent UI flashing for quick operations
  const [delayedLoading] = useDebounce(isFetchingKeys || isFetchingValues, 800);
  const loadError = (isKeysError ? (typeof keysError === "string" ? keysError : (keysError instanceof Error ? keysError.message : "Unknown error")) : null)
    || (isValuesError ? (typeof valuesError === "string" ? valuesError : (valuesError instanceof Error ? valuesError.message : "Unknown error")) : null);

  // Path history state
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const pathHistoryFilteredByPrefix = useMemo(() => {
    return pathHistory.filter(path => path.startsWith(keyPrefix));
  }, [pathHistory, keyPrefix]);
  const [showPathSuggestions, setShowPathSuggestions] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPathSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);


  // Dialog state
  const [dialogState, setDialogState] = useState<{
    action: "add" | "edit" | "delete" | "view",
    key: string,
    value: string,
    item?: EtcdItem
  } | null>(null);

  // Load path history
  useEffect(() => {
    async function loadPathHistory() {
      try {
        setPathHistory(await getPathHistory(currentProfileName ?? ""));
      } catch (error) {
        console.error('Failed to load path history:', error);
      }
    }
    loadPathHistory();
  }, [currentProfileName]);

  // Manual refresh
  const handleManualRefresh = async () => {
    await refetchKeys();
    await refetchValues();
    if (keyPrefix !== "") setPathHistory(await savePathToHistory(keyPrefix, currentProfileName ?? ""));
  };

  // Pagination
  const paginatedData = useMemo(() => {
    const set = new Set(pageKeys);
    return pageRangeItems.filter(i => set.has(i.key)); // In case of getting extra keys during value fetching
  }, [pageRangeItems, pageKeys]);

  // Handle path selection from dropdown
  const handleSelectPath = async (path: string) => {
    setKeyPrefix(path);
    setShowPathSuggestions(false);
    setPathHistory(await savePathToHistory(path, currentProfileName ?? ""));
    setCurrentPage(1);
    await refetchKeys();
  };

  // Define the end element for search input
  const searchEndElement = searchQuery ? (
    <CloseButton
      size="xs"
      onClick={() => {
        setSearchQuery("");
        setCurrentPage(1); // Reset to first page
      }}
      me="-2"
    />
  ) : undefined;

  return (
    <Flex direction="column" height="100vh">
      <Flex marginTop={0} direction="column" overflowY="auto">
        {/* Header */}
        <Flex
          as="header"
          width="full"
          p={4}
          borderBottomWidth="1px"
          align="center"
        >
          <Heading size="md">ETCD GUI</Heading>
          <Spacer />
        </Flex>

        {/* Toolbar */}
        <Box p={4} borderBottomWidth="1px">
          <VStack gap={4}>
            {/* Path navigation and refresh button */}
            <Flex width="full" align="center" gap={2} position="relative">
              <Box borderWidth="1px" borderRadius="md" p={2}>
                <LuFolder />
              </Box>
              <Box position="relative" flex="1" ref={dropdownRef}>
                <InputGroup>
                  <Input
                    {...codeInputProps}
                    ref={pathInputRef}
                    value={keyPrefix}
                    onChange={(e) => setKeyPrefix(e.target.value)}
                    onFocus={() => pathHistory.length > 0 && setShowPathSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleManualRefresh();
                        setShowPathSuggestions(false);
                      }
                    }}
                    placeholder="Key prefix"
                    flex="1"
                  />
                </InputGroup>

                {pathHistory.length > 0 && (
                  <Box position="absolute" right="8px" top="50%" transform="translateY(-50%)" zIndex={2}>
                    <Tooltip content="Show history" showArrow>
                      <IconButton
                        aria-label="Path history"
                        children={<LuHistory />}
                        onClick={() => setShowPathSuggestions(!showPathSuggestions)}
                        size="sm"
                        variant="ghost"
                      />
                    </Tooltip>
                  </Box>
                )}

                {/* Path suggestions dropdown */}
                {showPathSuggestions && pathHistoryFilteredByPrefix.length > 0 && (
                  <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    mt={1}
                    zIndex={10}
                    bg="bg.panel"
                    borderWidth="thin"
                    borderRadius="md"
                    boxShadow="md"
                    maxH="10rem"
                    overflowY="auto"
                  >
                    {pathHistoryFilteredByPrefix.map((path, index) => (
                      <Box
                        key={index}
                        p={2}
                        cursor="pointer"
                        _hover={{ bg: "bg.solid" }}
                        onClick={() => handleSelectPath(path)}
                        fontFamily="mono"
                        fontSize="sm"
                      >
                        {path}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              <Button onClick={handleManualRefresh} loading={delayedLoading} width="7rem">
                <LuRefreshCw />Refresh
              </Button>
            </Flex>

            {/* Search and actions */}
            <Flex width="full" gap={2}>
              <Flex flex="1" align="center" gap={2}>
                <Box borderWidth="1px" borderRadius="md" p={2}>
                  <LuSearch />
                </Box>
                <InputGroup endElement={searchEndElement} flex="1">
                  <Input
                    {...codeInputProps}
                    placeholder="Search keys..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1); // Reset to first page when search changes
                    }}
                    flex="1"
                  />
                </InputGroup>
              </Flex>

              <Button onClick={() => setDialogState({ action: "add", key: "", value: "" })} width="7rem">
                <LuPlus />
                Add
              </Button>
            </Flex>
          </VStack>
        </Box>

        {/* Key-value table */}
        <Table.Root>
          <Table.ColumnGroup>
            <Table.Column htmlWidth="35%" />
            <Table.Column htmlWidth="55%" />
            <Table.Column />
          </Table.ColumnGroup>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Key</Table.ColumnHeader>
              <Table.ColumnHeader>Value</Table.ColumnHeader>
              <Table.ColumnHeader>Actions</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {delayedLoading ? (
              // Loading skeletons
              Array.from({ length: 5 }).map((_, index) => (
                <Table.Row key={`skeleton-${index}`}>
                  <Table.Cell>
                    <Skeleton height="20px" width="80%" />
                  </Table.Cell>
                  <Table.Cell>
                    <Skeleton height="20px" width="90%" />
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap={2}>
                      <Skeleton height="32px" width="32px" borderRadius="md" />
                      <Skeleton height="32px" width="32px" borderRadius="md" />
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : paginatedData.length > 0 ? (
              // Actual data rows
              paginatedData.map((item) => (
                <Table.Row key={item.key}>
                  <Table.Cell maxWidth={200}>
                    <TableRowTooltip content={item.key} maxWidth="35vw">
                      <Text fontFamily="mono" lineClamp={1}>{item.key}</Text>
                    </TableRowTooltip>
                  </Table.Cell>
                  <Table.Cell maxWidth={200}>
                    <TableRowTooltip content={item.value} maxWidth="55vw">
                      <Text fontFamily="mono" lineClamp={1}>{item.value}</Text>
                    </TableRowTooltip>
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap={2}>
                      <Tooltip content="View" showArrow>
                        <IconButton
                          aria-label="View"
                          children={<TbEye />}
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialogState({ action: "view", key: item.key, value: item.value, item })}
                        />
                      </Tooltip>
                      <Tooltip content="Edit key" showArrow>
                        <IconButton
                          aria-label="Edit"
                          children={<TbEdit />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setDialogState({ action: "edit", key: item.key, value: item.value, })}
                        />
                      </Tooltip>
                      <Tooltip content="Delete key" showArrow>
                        <IconButton
                          aria-label="Delete"
                          children={<LuTrash2 />}
                          size="sm"
                          colorPalette="red"
                          variant="ghost"
                          onClick={() => setDialogState({ action: "delete", key: item.key, value: item.value })}
                        />
                      </Tooltip>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              // Empty state
              <Table.Row>
                <Table.Cell colSpan={3} textAlign="center" py={8}>
                  {loadError ? (
                    <Text color="red.500">Error loading data: {String(loadError)}</Text>
                  ) : (
                    <Text>No items found</Text>
                  )}
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Root>
      </Flex>

      {/* Pagination controls */}
      <Flex marginTop="auto" paddingTop={2} justifyContent="center" borderTopWidth="thin">
        <Select.Root
          collection={pageSizeCollection}
          onValueChange={val => {
            setPageSize(Number(val.value));
            setCurrentPage(1);
          }}
          defaultValue={[String(pageSize)]}
          size="sm"
          width="8vw"
        >
          <Select.HiddenSelect />
          <Select.Control>
            <Select.Trigger>
              <Select.ValueText placeholder="Page size" />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content>
                {pageSizeCollection.items.map((option) => (
                  <Select.Item item={option} key={option.value}>
                    {option.label}
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
        <Skeleton loading={delayedLoading} borderRadius="md">
          <Pagination.Root
            count={filteredKeys.length}
            pageSize={pageSize}
            page={currentPage}
            onPageChange={(details) => { setCurrentPage(details.page); }}
          >
            <ButtonGroup variant="ghost" size="sm" wrap="wrap">
              <Pagination.PrevTrigger asChild>
                <IconButton aria-label="Previous page">
                  <LuChevronLeft />
                </IconButton>
              </Pagination.PrevTrigger>

              <Pagination.Items
                render={(page) => (
                  <IconButton
                    aria-label={`Page ${page.value}`}
                    variant={{ base: "ghost", _selected: "outline" }}
                  >
                    {page.value}
                  </IconButton>
                )}
              />

              <Pagination.NextTrigger asChild>
                <IconButton aria-label="Next page">
                  <LuChevronRight />
                </IconButton>
              </Pagination.NextTrigger>
            </ButtonGroup>
          </Pagination.Root>
        </Skeleton>
      </Flex>

      {/* Status bar */}
      <HStack margin={2}>
        <Skeleton loading={delayedLoading} display="inline-block" minW="20px">
          <Badge fontSize="x-small">{!loadError && "Connected to: "}{appConfig?.current_profile}</Badge>
        </Skeleton>
        <Skeleton loading={delayedLoading} display="inline-block" minW="20px">
          <Badge>{filteredKeys.length} keys found</Badge>
        </Skeleton>
        {searchQuery && (
          <Badge colorPalette="blue">Search: "{searchQuery}"</Badge>
        )}
        <Spacer />
        {loadError ?
          <Status.Root colorPalette="red">
            <Status.Indicator /> Connection Error
          </Status.Root>
          : delayedLoading ?
            <Status.Root colorPalette="yellow">
              <Status.Indicator /> Loading...
            </Status.Root> :
            <Status.Root colorPalette="green">
              <Status.Indicator /> Ready
            </Status.Root>
        }
      </HStack>

      {/* Add Key Dialog */}
      {dialogState && dialogState.action === "add" && (
        <AddKeyDialog
          defaultKeyPrefix={keyPrefix}
          onClose={() => setDialogState(null)}
          refetch={() => { refetchKeys(); refetchValues(); }}
        />
      )}

      {/* Edit Key Dialog */}
      {dialogState && dialogState.action === "edit" && (
        <EditKeyDialog
          keyToEdit={dialogState.key}
          valueToEdit={dialogState.value}
          onClose={() => setDialogState(null)}
          refetch={() => { refetchKeys(); refetchValues(); }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {dialogState && dialogState.action === "delete" && (
        <DeleteKeyDialog
          keyToDelete={dialogState.key}
          valueToDelete={dialogState.value}
          onClose={() => setDialogState(null)}
          refetch={() => { refetchKeys(); refetchValues(); }}
        />
      )}

      {/* View Value Dialog */}
      {dialogState && dialogState.action === "view" && (
        <ViewValueDialog
          keyToView={dialogState.key}
          valueToView={dialogState.value}
          item={dialogState.item}
          onClose={() => setDialogState(null)}
        />
      )}

    </Flex>
  );
}

export default Dashboard;
