import type { ParsedMetricFamily, ParsedMetricSample } from "../../../api/etcd";

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

export function sampleMatchesLabelFilters(sample: { labels?: Record<string, string> }, labelTokens: string[]): boolean {
    if (labelTokens.length === 0) return true;
    if (!sample.labels) return false;

    return labelTokens.every((token) => {
        const i = token.indexOf("=");
        const key = i === -1 ? token : token.slice(0, i);
        const value = i === -1 ? "" : token.slice(i + 1);
        return sample.labels?.[key] === value;
    });
}

export function extractLabelKeys(samples: ParsedMetricSample[]): string[] {
    const labelKeySet = new Set<string>();

    for (const sample of samples) {
        if (!sample.labels) {
            continue;
        }

        for (const key of Object.keys(sample.labels)) {
            labelKeySet.add(key);
        }
    }

    return Array.from(labelKeySet).sort((a, b) => a.localeCompare(b));
}

export function compareMetricCellValues(left: string | undefined, right: string | undefined): number {
    const a = left ?? "", b = right ?? "";
    const na = Number(a), nb = Number(b);
    if (a.trim() && b.trim() && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}