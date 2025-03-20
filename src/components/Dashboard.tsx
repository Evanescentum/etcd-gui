import { useState, useMemo, useEffect } from "react";
import {
  Box,
  ButtonGroup,
  CloseButton,
  Container,
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
  Status
} from "@chakra-ui/react";
import { LuPlus, LuTrash2, LuRefreshCw, LuSearch, LuFolder, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { TbEdit } from "react-icons/tb";
import { Tooltip } from "../components/ui/tooltip";
import { toaster } from "../components/ui/toaster";
import { AppConfig, fetchEtcdItems } from "../api/etcd";
import debounce from "lodash.debounce";
import AddKeyDialog from "./dialogs/AddKeyDialog";
import DeleteKeyDialog from "./dialogs/DeleteKeyDialog";
import EditKeyDialog from "./dialogs/EditKeyDialog";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

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
  const delayedLoading = useDelayedLoading(loading, 800);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI state
  const [keyPrefix, setKeyPrefix] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

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

  // Effect to handle force refresh from parent
  useEffect(() => {
    if (shouldRefresh) {
      setTableData([]);
      loadEtcdData();
      // Notify parent that refresh is complete
      onRefreshComplete?.();
    }
  }, [shouldRefresh]);

  // Filter and paginate data
  const filteredData = useMemo(() => {
    return tableData
      .filter(item => (
        searchQuery ? item.key.includes(searchQuery) || item.value.includes(searchQuery) : true
      ));
  }, [tableData, keyPrefix, searchQuery]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleKeyDelete = (key: string, value: string) => {
    setDialogState({
      action: "delete",
      key,
      value,
    });
  };

  const handleKeyEdit = (key: string, value: string) => {
    setDialogState({
      action: "edit",
      key,
      value,
    });
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
    <Container maxW="container.xl" p={0}>
      <Flex direction="column" h="100vh">
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
        <Flex flex="1" direction="column" overflow="hidden">
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
                  onChange={(e) => {
                    setKeyPrefix(e.target.value);
                    // Use debounced version of loadEtcdData that only executes 300ms after last call
                    debounce(loadEtcdData, 300)();
                  }}
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

                <Tooltip content="Add new key" showArrow>
                  <Button
                    onClick={() => setDialogState({ action: "add", key: "", value: "" })}
                    colorScheme="blue"
                  >
                    <Box mr={2}><LuPlus /></Box>
                    Add
                  </Button>
                </Tooltip>
              </Flex>
            </VStack>
          </Box>

          {/* Key-value table */}

          <Table.Root width="full" flex={1}>
            <Table.ColumnGroup>
              <Table.Column htmlWidth="35%" />
              <Table.Column htmlWidth="55%" />
              <Table.Column />
            </Table.ColumnGroup>
            <Table.Header position="sticky" top={0}>
              <Table.Row>
                <Table.ColumnHeader>Key</Table.ColumnHeader>
                <Table.ColumnHeader>Value</Table.ColumnHeader>
                <Table.ColumnHeader width="120px">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {delayedLoading ? ( // Use delayedLoading instead of loading for skeletons
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
                      <Tooltip content={<Text fontFamily="mono">{item.key}</Text>} openDelay={200} interactive>
                        <Text fontFamily="mono" lineClamp={1}>
                          {item.key}
                        </Text>
                      </Tooltip>
                    </Table.Cell>
                    <Table.Cell maxWidth={200}>
                      <Tooltip content={<Text fontFamily="mono">{item.value}</Text>} openDelay={200} interactive>
                        <Text fontFamily="mono" lineClamp={1}>
                          {item.value}
                        </Text>
                      </Tooltip>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <Tooltip content="Edit key" showArrow>
                          <IconButton
                            aria-label="Edit"
                            children={<TbEdit />}
                            size="sm"
                            onClick={() => handleKeyEdit(item.key, item.value)}
                          />
                        </Tooltip>
                        <Tooltip content="Delete key" showArrow>
                          <IconButton
                            aria-label="Delete"
                            children={<LuTrash2 />}
                            size="sm"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleKeyDelete(item.key, item.value)}
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

          {/* Pagination controls */}
          <Flex p={4} justifyContent="center" alignItems="center" borderTopWidth="1px">
            <Skeleton loading={delayedLoading} borderRadius="md"> {/* Use delayedLoading instead of loading */}
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
          <HStack
            p={2}
            borderTopWidth="thin"
            gap={4}
          >
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
        </Flex>
      </Flex>

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

    </Container>
  );
}

export default Dashboard;
