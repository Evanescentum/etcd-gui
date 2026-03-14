import { useMemo, useState } from "react";
import {
    Badge,
    CloseButton,
    Drawer,
    EmptyState,
    HStack,
    Icon,
    Input,
    Table,
    Text,
    VStack,
} from "@chakra-ui/react";
import {
    type SortingState,
    type ColumnDef,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    flexRender,
} from "@tanstack/react-table";
import type { ParsedMetricSample } from "../../../api/etcd";
import { codeInputProps } from "@/utils/inputProps";
import { LuArrowDown, LuArrowUp, LuArrowUpDown, LuSearch } from "react-icons/lu";
import { type MetricFamilyView, sampleMatchesLabelFilters, compareMetricCellValues } from "./types";

interface MetricsDetailDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeFamily: MetricFamilyView | null;
    selectedLabelFilters: string[];
}

const MetricsDetailDrawer = ({
    open,
    onOpenChange,
    activeFamily,
    selectedLabelFilters,
}: MetricsDetailDrawerProps) => {
    const [detailSearchQuery, setDetailSearchQuery] = useState("");
    const [detailSorting, setDetailSorting] = useState<SortingState>([]);

    const detailLabelColumns = activeFamily?.labelKeys ?? [];

    const detailRows = useMemo(() => {
        if (!activeFamily) return [];

        const lowerDetailSearch = detailSearchQuery.trim().toLowerCase();

        return activeFamily.family.metrics.filter((sample) => {
            if (!sampleMatchesLabelFilters(sample, selectedLabelFilters)) return false;
            if (!lowerDetailSearch) return true;

            const labelsText = sample.labels
                ? Object.entries(sample.labels)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(" ")
                    .toLowerCase()
                : "";

            return sample.value.toLowerCase().includes(lowerDetailSearch) || labelsText.includes(lowerDetailSearch);
        });
    }, [activeFamily, detailSearchQuery, selectedLabelFilters]);

    const detailColumns = useMemo((): ColumnDef<ParsedMetricSample, string>[] => [
        ...detailLabelColumns.map((key): ColumnDef<ParsedMetricSample, string> => ({
            id: key,
            accessorFn: (row) => row.labels?.[key] ?? "-",
            header: key,
            sortingFn: (rowA, rowB, columnId) =>
                compareMetricCellValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        })),
        {
            id: "value",
            accessorFn: (row) => row.value,
            header: "Value",
            sortingFn: (rowA, rowB, columnId) =>
                compareMetricCellValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        },
    ], [detailLabelColumns]);

    const detailTable = useReactTable({
        data: detailRows,
        columns: detailColumns,
        state: { sorting: detailSorting },
        onSortingChange: setDetailSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
            setDetailSearchQuery("");
            setDetailSorting([]);
        }
    };

    return (
        <Drawer.Root
            open={open}
            placement="end"
            size="xl"
            onOpenChange={(e) => handleOpenChange(e.open)}
        >
            <Drawer.Backdrop />
            <Drawer.Positioner>
                <Drawer.Content>
                    <Drawer.CloseTrigger asChild>
                        <CloseButton size="sm" position="absolute" top={3} right={3} />
                    </Drawer.CloseTrigger>

                    <Drawer.Header>
                        <VStack align="stretch" gap={1}>
                            <Drawer.Title>{activeFamily?.family.name ?? "Metric Details"}</Drawer.Title>
                            {activeFamily && (
                                <HStack gap={2} wrap="wrap">
                                    <Badge colorPalette="blue" variant="subtle">{activeFamily.group}</Badge>
                                    <Badge variant="subtle">{activeFamily.family.type}</Badge>
                                    <Badge variant="outline">{activeFamily.family.metrics.length} samples</Badge>
                                    <Badge variant="outline">{detailLabelColumns.length} label keys</Badge>
                                </HStack>
                            )}
                        </VStack>
                    </Drawer.Header>

                    <Drawer.Body>
                        {!activeFamily ? (
                            <EmptyState.Root>
                                <EmptyState.Content>
                                    <EmptyState.Indicator>
                                        <LuSearch />
                                    </EmptyState.Indicator>
                                    <EmptyState.Title>No metric selected</EmptyState.Title>
                                    <EmptyState.Description>Select a metric family from the list to view details.</EmptyState.Description>
                                </EmptyState.Content>
                            </EmptyState.Root>
                        ) : (
                            <VStack align="stretch" gap={2}>
                                <Text fontSize="sm" color="fg.muted">{activeFamily.family.help}</Text>
                                <Input
                                    {...codeInputProps}
                                    placeholder="Search label values or metric values..."
                                    value={detailSearchQuery}
                                    onChange={(e) => setDetailSearchQuery(e.target.value)}
                                />
                                <Table.ScrollArea height="70vh" borderWidth="1px" borderRadius="md">
                                    <Table.Root variant="line" stickyHeader>
                                        <Table.Header>
                                            {detailTable.getHeaderGroups().map((headerGroup) => (
                                                <Table.Row key={headerGroup.id}>
                                                    {headerGroup.headers.map((header) => {
                                                        const sorted = header.column.getIsSorted();
                                                        return (
                                                            <Table.ColumnHeader
                                                                key={header.id}
                                                                onClick={header.column.getToggleSortingHandler()}
                                                                cursor="pointer"
                                                                userSelect="none"
                                                                _hover={{ bg: "bg.subtle" }}
                                                            >
                                                                <HStack gap={1} minW={0} justifyContent="flex-start">
                                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                                    <Icon fontSize="xs" color={sorted ? "fg" : "fg.muted"}>
                                                                        {sorted === "asc" ? <LuArrowUp /> : sorted === "desc" ? <LuArrowDown /> : <LuArrowUpDown />}
                                                                    </Icon>
                                                                </HStack>
                                                            </Table.ColumnHeader>
                                                        );
                                                    })}
                                                </Table.Row>
                                            ))}
                                        </Table.Header>
                                        <Table.Body>
                                            {detailTable.getRowModel().rows.map((row) => (
                                                <Table.Row key={row.id}>
                                                    {row.getVisibleCells().map((cell) => (
                                                        <Table.Cell key={cell.id}>
                                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                        </Table.Cell>
                                                    ))}
                                                </Table.Row>
                                            ))}
                                        </Table.Body>
                                    </Table.Root>
                                </Table.ScrollArea>

                                {detailRows.length === 0 && (
                                    <EmptyState.Root>
                                        <EmptyState.Content>
                                            <EmptyState.Indicator>
                                                <LuSearch />
                                            </EmptyState.Indicator>
                                            <EmptyState.Title>No samples found</EmptyState.Title>
                                            <EmptyState.Description>Try removing some label filters or search text.</EmptyState.Description>
                                        </EmptyState.Content>
                                    </EmptyState.Root>
                                )}
                            </VStack>
                        )}
                    </Drawer.Body>
                </Drawer.Content>
            </Drawer.Positioner>
        </Drawer.Root>
    );
};

export default MetricsDetailDrawer;