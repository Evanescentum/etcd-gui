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
import { flexRender, type Table as ReactTable } from "@tanstack/react-table";
import type { ParsedMetricSample } from "../../../api/etcd";
import { codeInputProps } from "@/utils/inputProps";
import { LuArrowDown, LuArrowUp, LuArrowUpDown, LuSearch } from "react-icons/lu";
import type { MetricFamilyView } from "./types";

interface MetricsDetailDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeFamily: MetricFamilyView | null;
    detailLabelColumns: string[];
    detailSearchQuery: string;
    onDetailSearchQueryChange: (value: string) => void;
    detailRows: ParsedMetricSample[];
    detailTable: ReactTable<ParsedMetricSample>;
}

const MetricsDetailDrawer = ({
    open,
    onOpenChange,
    activeFamily,
    detailLabelColumns,
    detailSearchQuery,
    onDetailSearchQueryChange,
    detailRows,
    detailTable,
}: MetricsDetailDrawerProps) => {
    return (
        <Drawer.Root
            open={open}
            placement="end"
            size="xl"
            onOpenChange={(e) => onOpenChange(e.open)}
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
                                    onChange={(e) => onDetailSearchQueryChange(e.target.value)}
                                />
                                <Table.ScrollArea height="70vh" borderWidth="1px" borderRadius="md">
                                    <Table.Root variant="line" stickyHeader native>
                                        <thead>
                                            {detailTable.getHeaderGroups().map((headerGroup) => (
                                                <tr key={headerGroup.id}>
                                                    {headerGroup.headers.map((header) => {
                                                        const canSort = header.column.getCanSort();
                                                        const sorted = header.column.getIsSorted();
                                                        return (
                                                            <th
                                                                key={header.id}
                                                                onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                                                            >
                                                                <HStack gap={1} minW={0} justifyContent="flex-start">
                                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                                    {canSort && (
                                                                        <Icon fontSize="xs" color={sorted ? "fg" : "fg.muted"}>
                                                                            {sorted === "asc" ? <LuArrowUp /> : sorted === "desc" ? <LuArrowDown /> : <LuArrowUpDown />}
                                                                        </Icon>
                                                                    )}
                                                                </HStack>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </thead>
                                        <tbody>
                                            {detailTable.getRowModel().rows.map((row) => (
                                                <tr key={row.id}>
                                                    {row.getVisibleCells().map((cell) => (
                                                        <td key={cell.id}>
                                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
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