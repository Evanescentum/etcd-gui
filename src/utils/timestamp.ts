/**
 * Timestamp utilities for identifying and formatting Unix timestamps
 */

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
