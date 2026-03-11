import type { Dispatch, SetStateAction } from "react";
import { Badge, Box, Button, Card, Checkbox, Input, Text, VStack, HStack } from "@chakra-ui/react";
import type { ParsedMetricFamily } from "../../../api/etcd";
import { codeInputProps } from "@/utils/inputProps";
import type { LabelFacet } from "./types";

interface MetricsFiltersProps {
    metricGroupOrder: string[];
    metricTypeOptions: ParsedMetricFamily["type"][];
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    selectedGroups: string[];
    setSelectedGroups: Dispatch<SetStateAction<string[]>>;
    groupCounts: Record<string, number>;
    selectedTypes: ParsedMetricFamily["type"][];
    setSelectedTypes: Dispatch<SetStateAction<ParsedMetricFamily["type"][]>>;
    labelFacets: LabelFacet[];
    selectedLabelFilters: string[];
    setSelectedLabelFilters: Dispatch<SetStateAction<string[]>>;
    appliedFilterCount: number;
    onClearAllFilters: () => void;
}

function toggleSelection<T>(items: T[], item: T, checked: boolean): T[] {
    if (checked) {
        return items.includes(item) ? items : [...items, item];
    }

    return items.filter((existing) => existing !== item);
}

const MetricsFilters = ({
    metricGroupOrder,
    metricTypeOptions,
    searchQuery,
    onSearchQueryChange,
    selectedGroups,
    setSelectedGroups,
    groupCounts,
    selectedTypes,
    setSelectedTypes,
    labelFacets,
    selectedLabelFilters,
    setSelectedLabelFilters,
    appliedFilterCount,
    onClearAllFilters,
}: MetricsFiltersProps) => {
    return (
        <Card.Root width={{ base: "full", xl: "320px" }} variant="outline">
            <Card.Header pb={2}>
                <HStack justify="space-between">
                    <Text fontWeight="semibold">Filters</Text>
                    <Badge variant="subtle">{appliedFilterCount} active</Badge>
                </HStack>
            </Card.Header>
            <Card.Body pt={0}>
                <VStack align="stretch" gap={5}>
                    <Box>
                        <Text fontSize="sm" color="fg.muted" mb={2}>Metric Search</Text>
                        <Input
                            {...codeInputProps}
                            placeholder="Search by name or description..."
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value.trim().toLowerCase())}
                        />
                    </Box>

                    <Box>
                        <Text fontSize="sm" color="fg.muted" mb={2}>Metric Groups</Text>
                        <VStack align="stretch" gap={2} maxH="180px" overflowY="auto" pr={1}>
                            {metricGroupOrder.map((group) => {
                                const checked = selectedGroups.includes(group);
                                const count = groupCounts[group] ?? 0;
                                return (
                                    <Checkbox.Root
                                        key={group}
                                        checked={checked}
                                        disabled={count === 0}
                                        onCheckedChange={(e: any) => {
                                            setSelectedGroups((prev) => toggleSelection(prev, group, e.checked === true));
                                        }}
                                    >
                                        <Checkbox.HiddenInput />
                                        <Checkbox.Control />
                                        <Checkbox.Label>
                                            <HStack gap={2}>
                                                <Text>{group}</Text>
                                                <Badge size="sm" variant="subtle">{count}</Badge>
                                            </HStack>
                                        </Checkbox.Label>
                                    </Checkbox.Root>
                                );
                            })}
                        </VStack>
                    </Box>

                    <Box>
                        <Text fontSize="sm" color="fg.muted" mb={2}>Metric Types</Text>
                        <VStack align="stretch" gap={2}>
                            {metricTypeOptions.map((type) => (
                                <Checkbox.Root
                                    key={type}
                                    checked={selectedTypes.includes(type)}
                                    onCheckedChange={(e: any) => {
                                        setSelectedTypes((prev) => toggleSelection(prev, type, e.checked === true));
                                    }}
                                >
                                    <Checkbox.HiddenInput />
                                    <Checkbox.Control />
                                    <Checkbox.Label>{type}</Checkbox.Label>
                                </Checkbox.Root>
                            ))}
                        </VStack>
                    </Box>

                    <Box>
                        <HStack justify="space-between" mb={2}>
                            <Text fontSize="sm" color="fg.muted">Label Facets</Text>
                            <Badge variant="outline">Top {Math.min(labelFacets.length, 6)}</Badge>
                        </HStack>

                        {labelFacets.length === 0 ? (
                            <Text fontSize="sm" color="fg.muted">No label facets for current filters.</Text>
                        ) : (
                            <VStack align="stretch" gap={3} maxH="320px" overflowY="auto" pr={1}>
                                {labelFacets.slice(0, 6).map((facet) => (
                                    <Box key={facet.key}>
                                        <HStack justify="space-between" mb={1}>
                                            <Text fontSize="sm" fontWeight="medium" fontFamily="mono">{facet.key}</Text>
                                            <Badge size="sm" variant="subtle">{facet.totalCount}</Badge>
                                        </HStack>
                                        <VStack align="stretch" gap={1}>
                                            {facet.values.slice(0, 8).map(({ value, count }) => {
                                                const token = `${facet.key}=${value}`;
                                                const checked = selectedLabelFilters.includes(token);
                                                return (
                                                    <Checkbox.Root
                                                        key={token}
                                                        checked={checked}
                                                        onCheckedChange={(e: any) => {
                                                            setSelectedLabelFilters((prev) => toggleSelection(prev, token, e.checked === true));
                                                        }}
                                                    >
                                                        <Checkbox.HiddenInput />
                                                        <Checkbox.Control />
                                                        <Checkbox.Label>
                                                            <HStack justify="space-between" width="full" gap={2}>
                                                                <Text fontSize="xs" fontFamily="mono" lineClamp={1}>{value}</Text>
                                                                <Badge size="sm" variant="outline">{count}</Badge>
                                                            </HStack>
                                                        </Checkbox.Label>
                                                    </Checkbox.Root>
                                                );
                                            })}
                                        </VStack>
                                    </Box>
                                ))}
                            </VStack>
                        )}
                    </Box>

                    <Button variant="outline" onClick={onClearAllFilters} disabled={appliedFilterCount === 0}>
                        Clear Filters
                    </Button>
                </VStack>
            </Card.Body>
        </Card.Root>
    );
};

export default MetricsFilters;