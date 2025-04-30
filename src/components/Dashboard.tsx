import { useState, useMemo, useEffect } from "react";
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
import { LuPlus, LuTrash2, LuRefreshCw, LuSearch, LuFolder, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { TbEdit } from "react-icons/tb";
import { Tooltip } from "../components/ui/tooltip";
import { toaster } from "../components/ui/toaster";
import { AppConfig, fetchEtcdItems, initializeEtcdClient } from "../api/etcd";
import AddKeyDialog from "./dialogs/AddKeyDialog";
import DeleteKeyDialog from "./dialogs/DeleteKeyDialog";
import EditKeyDialog from "./dialogs/EditKeyDialog";
import { useDebounce, useDebouncedCallback } from "use-debounce";

// 表格单元格中的 Tooltip 组件
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
  appInitializing: boolean;
  appConfig: AppConfig | null;
  shouldRefresh?: boolean;
  onRefreshComplete?: () => void;
}

function Dashboard({ appInitializing, appConfig, shouldRefresh = false, onRefreshComplete }: DashboardProps) {
  // Data state
  const [tableData, setTableData] = useState<Array<{ key: string, value: string }>>([]);
  const [loading, setLoading] = useState(appInitializing);
  // Add delayed loading state to prevent UI flashing for quick operations
  const [delayedLoading] = useDebounce(loading, 800);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI state
  const [keyPrefix, setKeyPrefix] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const pageSizeCollection = createListCollection({
    items: [
      { label: "5/页", value: "5" },
      { label: "10/页", value: "10" },
      { label: "20/页", value: "20" },
      { label: "50/页", value: "50" },
      { label: "100/页", value: "100" },
    ]
  });

  // Dialog state
  const [dialogState, setDialogState] = useState<{
    action: "add" | "edit" | "delete",
    key: string,
    value: string,
  } | null>(null);

  // Load etcd data function
  async function loadEtcdData() {
    setLoading(true);
    setLoadError(null);

    try {
      const items = await fetchEtcdItems(keyPrefix);
      setTableData(items);
    } catch (error) {
      console.error('Failed to load etcd data:', error);
      setLoadError(error as string);
      toaster.create({
        title: "Connection Error",
        description: `Could not connect to etcd database: ${error}`,
        meta: { closable: true },
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }
  const debouncedLoadEtcdData = useDebouncedCallback(loadEtcdData, 300);

  useEffect(() => {
    // Use debounced version of loadEtcdData that only executes 300ms after last call
    debouncedLoadEtcdData();
  }, [keyPrefix]);

  // Effect to handle force refresh from parent
  useEffect(() => {
    if (shouldRefresh) {
      setTableData([]);
      initializeEtcdClient();
      loadEtcdData();
      // Notify parent that refresh is complete
      onRefreshComplete?.();
    }
  }, [shouldRefresh]);

  // Filter and paginate data
  const filteredData = useMemo(() => {
    return tableData.filter(item => (
      searchQuery ? item.key.includes(searchQuery) || item.value.includes(searchQuery) : true
    ));
  }, [tableData, keyPrefix, searchQuery]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

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
          <Tooltip content="Refresh key list" showArrow>
            <IconButton
              aria-label="Refresh"
              children={<LuRefreshCw />}
              size="sm"
              onClick={loadEtcdData}
              loading={loading} // Keep using immediate loading for button states
            />
          </Tooltip>
        </Flex>

        {/* Main content */}
        {/* Toolbar */}
        <Box p={4} borderBottomWidth="1px">
          <VStack gap={4}>
            {/* Path navigation */}
            <Flex width="full" align="center" gap={2}>
              <Box borderWidth="1px" borderRadius="md" p={2}>
                <LuFolder />
              </Box>
              <Input
                fontFamily="mono"
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value)}
                placeholder="Key prefix"
                flex="1"
              />
            </Flex>

            {/* Search and actions */}
            <Flex width="full" gap={2}>
              <Flex flex="1" align="center" gap={2}>
                <Box borderWidth="1px" borderRadius="md" p={2}>
                  <LuSearch />
                </Box>
                <InputGroup endElement={searchEndElement} flex="1">
                  <Input
                    fontFamily="mono"
                    placeholder="Search keys and values..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1); // Reset to first page when search changes
                    }}
                    flex="1"
                  />
                </InputGroup>
              </Flex>

              <Tooltip content="Add new key" showArrow>
                <Button
                  onClick={() => setDialogState({ action: "add", key: "", value: "" })}
                  colorScheme="blue"
                >
                  <LuPlus />
                  Add
                </Button>
              </Tooltip>
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
                      <Tooltip content="Edit key" showArrow>
                        <IconButton
                          aria-label="Edit"
                          children={<TbEdit />}
                          size="sm"
                          onClick={() => setDialogState({ action: "edit", key: item.key, value: item.value, })}
                        />
                      </Tooltip>
                      <Tooltip content="Delete key" showArrow>
                        <IconButton
                          aria-label="Delete"
                          children={<LuTrash2 />}
                          size="sm"
                          colorScheme="red"
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
                    <Text color="red.500">Error loading data: {loadError}</Text>
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
              <Select.ValueText placeholder="分页大小" />
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
            count={filteredData.length}
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
          <Badge>{filteredData.length} keys found</Badge>
        </Skeleton>
        {searchQuery && (
          <Badge colorScheme="blue">Search: "{searchQuery}"</Badge>
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
          onSuccess={() => { setDialogState(null); loadEtcdData(); }}
          onCancel={() => setDialogState(null)}
          loading={loading}
          setLoading={setLoading}
        />
      )}

      {/* Edit Key Dialog */}
      {dialogState && dialogState.action === "edit" && (
        <EditKeyDialog
          keyToEdit={dialogState.key}
          valueToEdit={dialogState.value}
          onSuccess={() => { setDialogState(null); loadEtcdData(); }}
          onCancel={() => setDialogState(null)}
          loading={loading}
          setLoading={setLoading}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {dialogState && dialogState.action === "delete" && (
        <DeleteKeyDialog
          keyToDelete={dialogState.key}
          valueToDelete={dialogState.value}
          onSuccess={() => { setDialogState(null); loadEtcdData(); }}
          onCancel={() => setDialogState(null)}
          loading={loading}
          setLoading={setLoading}
        />
      )}

    </Flex>
  );
}

export default Dashboard;
