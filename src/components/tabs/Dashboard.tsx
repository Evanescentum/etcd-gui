import { useEffect, useState } from "react";
import { useDashboardItemsQuery } from "../../hooks/useEtcdQuery";
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
import { LuPlus, LuTrash2, LuSearch, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { TbEdit, TbEye } from "react-icons/tb";
import { type EtcdItem } from "../../api/etcd";
import AddKeyDialog from "../dialogs/AddKeyDialog";
import DeleteKeyDialog from "../dialogs/DeleteKeyDialog";
import EditKeyDialog from "../dialogs/EditKeyDialog";
import ViewValueDialog from "../dialogs/ViewValueDialog";
import PathInput from "../PathInput";
import { useDebounce } from "use-debounce";
import { useActiveProfile } from "@/contexts/active-profile";

const pageSizeCollection = createListCollection({
  items: [
    { label: "5/page", value: "5" },
    { label: "10/page", value: "10" },
    { label: "20/page", value: "20" },
    { label: "50/page", value: "50" },
    { label: "100/page", value: "100" },
  ]
});

function ConnectionStatus({ loadError, showTyping, isSourceLoading, isPageRefreshing, isTotalLoading, isStreaming }: {
  loadError: string | null;
  showTyping: boolean;
  isSourceLoading: boolean;
  isPageRefreshing: boolean;
  isTotalLoading: boolean;
  isStreaming: boolean;
}) {
  const [color, label] =
    loadError ? ["red", "Connection Error"] :
      showTyping ? ["blue", "Typing..."] :
        isSourceLoading ? ["yellow", "Loading data..."] :
          isPageRefreshing ? ["yellow", "Loading page..."] :
            isTotalLoading ? ["yellow", "Scanning..."] :
              isStreaming ? ["yellow", "Streaming..."] :
                ["green", "Ready"];

  return (
    <Status.Root colorPalette={color}>
      <Status.Indicator /> {label}
    </Status.Root>
  );
}

interface DashboardProps {
  configLoading: boolean;
}

function Dashboard({ configLoading }: DashboardProps) {
  const { activeProfile, appConfig } = useActiveProfile();
  const [keyPrefixInput, setKeyPrefixInput] = useState("/");
  const [committedKeyPrefix, setCommittedKeyPrefix] = useState("/");
  const [debouncedKeyPrefix] = useDebounce(keyPrefixInput, 500);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    setCommittedKeyPrefix(debouncedKeyPrefix);
  }, [debouncedKeyPrefix]);

  const kvLoadMethod = appConfig.kv_load_method;

  const queryResult = useDashboardItemsQuery({
    enabled: !configLoading,
    keyPrefix: committedKeyPrefix,
    currentProfileName: activeProfile.name,
    searchQuery: debouncedSearchQuery,
    currentPage,
    pageSize,
    refreshNonce,
    loadMode: kvLoadMethod,
  });

  const {
    data,
    total,
    loadError,
    isPageLoading,
    isSourceLoading,
    isPageRefreshing,
    isStreaming,
    isTotalLoading,
  } = queryResult;

  useEffect(() => {
    if (total === null) {
      return;
    }

    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, pageSize, total]);

  const handleRefresh = (value?: string) => {
    const nextPrefix = value ?? keyPrefixInput;
    setKeyPrefixInput(nextPrefix);
    setCommittedKeyPrefix(nextPrefix);
    setCurrentPage(1);
    setRefreshNonce((current) => current + 1);
  };

  const [dialogState, setDialogState] = useState<{
    action: "add" | "edit" | "delete" | "view",
    key: string,
    value: string,
    item?: EtcdItem
  } | null>(null);

  const searchEndElement = searchQuery ? (
    <CloseButton
      size="xs"
      onClick={() => {
        setSearchQuery("");
        setCurrentPage(1);
      }}
      me="-2"
    />
  ) : undefined;

  const showTyping = keyPrefixInput !== committedKeyPrefix;
  const showUnknownTotal = total === null && isTotalLoading;

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
            <PathInput
              value={keyPrefixInput}
              onChange={(value) => {
                setKeyPrefixInput(value);
                setCurrentPage(1);
              }}
              profileName={activeProfile.name}
              onRefresh={handleRefresh}
              loading={isSourceLoading}
            />

            {/* Search and actions */}
            <Flex width="full" gap={2}>
              <Flex flex="1" align="center" gap={2}>
                <Box borderWidth="1px" borderRadius="md" p={2}>
                  <LuSearch />
                </Box>
                <InputGroup endElement={searchEndElement} flex="1">
                  <Input
                    {...codeInputProps}
                    placeholder={kvLoadMethod === "Lazy" ? "Search keys..." : "Search keys and values..."}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
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
            {isPageLoading ? (
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
            ) : data.length > 0 ? (
              data.map((item) => (
                <Table.Row key={item.key}>
                  <Table.Cell maxWidth={200}>
                    <Text fontFamily="mono" lineClamp={1} title={item.key}>
                      {item.key}
                    </Text>
                  </Table.Cell>
                  <Table.Cell maxWidth={200}>
                    <Text fontFamily="mono" lineClamp={1} title={item.value}>
                      {item.value}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap={2}>
                      <IconButton
                        aria-label="View"
                        title="View"
                        children={<TbEye />}
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialogState({ action: "view", key: item.key, value: item.value, item })}
                      />
                      <IconButton
                        aria-label="Edit"
                        title="Edit key"
                        children={<TbEdit />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialogState({ action: "edit", key: item.key, value: item.value, })}
                      />
                      <IconButton
                        aria-label="Delete"
                        title="Delete key"
                        children={<LuTrash2 />}
                        size="sm"
                        colorPalette="red"
                        variant="ghost"
                        onClick={() => setDialogState({ action: "delete", key: item.key, value: item.value })}
                      />
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={3} textAlign="center" py={8}>
                  {loadError ? (
                    <Text color="red.500">Error loading data: {String(loadError)}</Text>
                  ) : showUnknownTotal ? (
                    <Text>Scanning matches...</Text>
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
        {total !== null ? (
          <Pagination.Root
            count={total ?? 0}
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
        ) : (
          <Flex align="center" px={4}>
            <Text fontSize="sm" color="fg.muted">Scanning matches...</Text>
          </Flex>
        )}
      </Flex>

      <HStack margin={2}>
        <Skeleton loading={isPageLoading && data.length === 0} display="inline-block" minW="20px">
          <Badge fontSize="x-small">{!loadError && "Connected to: "}{appConfig?.current_profile}</Badge>
        </Skeleton>
        <Skeleton loading={showUnknownTotal} display="inline-block" minW="20px">
          <Badge>{total === null ? "Counting matches..." : `${total} keys found`}</Badge>
        </Skeleton>
        {searchQuery && (
          <Badge colorPalette="blue">Search: "{searchQuery}"</Badge>
        )}
        <Spacer />
        <ConnectionStatus
          loadError={loadError}
          showTyping={showTyping}
          isSourceLoading={isSourceLoading}
          isPageRefreshing={isPageRefreshing}
          isTotalLoading={isTotalLoading}
          isStreaming={isStreaming}
        />
      </HStack>

      {/* Add Key Dialog */}
      {dialogState && dialogState.action === "add" && (
        <AddKeyDialog
          defaultKeyPrefix={keyPrefixInput}
          onSuccess={queryResult.refetch}
          onClose={() => setDialogState(null)}
        />
      )}

      {/* Edit Key Dialog */}
      {dialogState && dialogState.action === "edit" && (
        <EditKeyDialog
          keyToEdit={dialogState.key}
          valueToEdit={dialogState.value}
          onSuccess={queryResult.refetch}
          onClose={() => setDialogState(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {dialogState && dialogState.action === "delete" && (
        <DeleteKeyDialog
          keyToDelete={dialogState.key}
          valueToDelete={dialogState.value}
          onSuccess={queryResult.refetch}
          onClose={() => setDialogState(null)}
        />
      )}

      {/* View Value Dialog */}
      {dialogState && dialogState.action === "view" && (
        <ViewValueDialog
          keyToView={dialogState.key}
          valueToView={dialogState.value}
          item={dialogState.item}
          onClose={() => setDialogState(null)}
          onNavigate={(path) => {
            setKeyPrefixInput(path);
            setCommittedKeyPrefix(path);
            setCurrentPage(1);
            setRefreshNonce((current) => current + 1);
          }}
        />
      )}

    </Flex>
  );
}

export default Dashboard;
