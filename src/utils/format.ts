export interface FormattedBytes {
    value: string;
    unit: string;
}

export function formatBytes(bytes: number): FormattedBytes {
    if (bytes === 0) {
        return { value: "0", unit: "Bytes" };
    }

    const base = 1024;
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
    const value = (Math.round((bytes / Math.pow(base, unitIndex)) * 100) / 100).toString();

    return {
        value,
        unit: units[unitIndex],
    };
}