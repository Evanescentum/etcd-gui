import type { ParsedMetricFamily } from "../../../api/etcd";

export interface MetricFamilyView {
    family: ParsedMetricFamily;
    group: string;
    labelKeys: string[];
}

export interface LabelFacet {
    key: string;
    totalCount: number;
    values: Array<{ value: string; count: number }>;
}