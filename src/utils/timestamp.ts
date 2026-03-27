import { DateTime } from "luxon";

/**
 * Timestamp utilities for identifying and formatting Unix timestamps
 */

export interface TimestampTextPart {
    type: "text" | "timestamp";
    value: string;
}

const TIMESTAMP_CANDIDATE_REGEX = /\b(?:\d{10}|\d{13})\b/g;

/**
 * Validates if a string represents a valid Unix timestamp
 * Supports both second-level (10 digits) and millisecond-level (13 digits)
 * Valid range: 2001-2033 (to avoid false positives with short numbers)
 */
export function isValidTimestamp(num: string): boolean {
    // Check if it's exactly 10 or 13 digits
    if (!/^\d{10}$|^\d{13}$/.test(num)) {
        return false;
    }

    const timestamp = parseTimestamp(num);

    // Valid range: 2001-01-01 to 2033-12-31
    // In milliseconds: 978307200000 to 2019686399999
    const MIN_TIMESTAMP = 978307200000;
    const MAX_TIMESTAMP = 2019686399999;

    return timestamp >= MIN_TIMESTAMP && timestamp <= MAX_TIMESTAMP;
}

/**
 * Parses a timestamp string to milliseconds
 * Automatically handles both second-level (10 digits) and millisecond-level (13 digits)
 */
export function parseTimestamp(str: string): number {
    const num = parseInt(str, 10);
    // If it's 10 digits, it's in seconds, convert to milliseconds
    return str.length === 10 ? num * 1000 : num;
}

export function formatTimestamp(timestampMs: number): { utc: string; local: string } {
    const dateTime = DateTime.fromMillis(timestampMs);
    if (!dateTime.isValid) {
        throw new Error(`Invalid timestamp: ${timestampMs}`);
    }

    return {
        utc: dateTime.toUTC().toISO()!,
        local: dateTime.toLocal().toISO()!,
    };
}

/**
 * Splits a string into plain-text and valid timestamp segments.
 */
export function splitTextByTimestamps(text: string): TimestampTextPart[] {
    const parts: TimestampTextPart[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(TIMESTAMP_CANDIDATE_REGEX)) {
        const value = match[0];
        const startIndex = match.index ?? 0;

        if (!isValidTimestamp(value)) {
            continue;
        }

        if (startIndex > lastIndex) {
            parts.push({
                type: "text",
                value: text.slice(lastIndex, startIndex),
            });
        }

        parts.push({
            type: "timestamp",
            value,
        });
        lastIndex = startIndex + value.length;
    }

    if (lastIndex < text.length) {
        parts.push({
            type: "text",
            value: text.slice(lastIndex),
        });
    }

    if (parts.length === 0) {
        return [{ type: "text", value: text }];
    }

    return parts;
}
