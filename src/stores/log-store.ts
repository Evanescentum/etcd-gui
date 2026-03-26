import { attachLogger } from "@tauri-apps/plugin-log";

const LOG_REGEX = /^([^\[]+)\[([^\]]*)\]\[([^\]]*)\]\[([^\]]*)\]\s+(.*)$/;
const FLUSH_INTERVAL_MS = 100;
const LOG_BUFFER_CAPACITY = 5000;

export interface ParsedLogLine {
    date: string;
    time: string;
    level: string;
    target: string;
    location: string;
    message: string;
}

export interface LogEntry {
    id: number;
    raw: string;
    lower: string;
    parsed: ParsedLogLine | null;
}

export interface LogStoreSnapshot {
    logs: LogEntry[];
    isWatching: boolean;
    error: string | null;
}

function parseLogLine(line: string): ParsedLogLine | null {
    const match = line.match(LOG_REGEX);
    if (!match) return null;

    const [, timestamp, level, target, location, message] = match;

    return {
        date: timestamp.substring(0, 10),
        time: timestamp.substring(11, 19),
        level,
        target,
        location,
        message,
    };
}

class RingBuffer<T> {
    private readonly buffer: Array<T | undefined>;
    private start = 0;
    private count = 0;

    constructor(private readonly capacity: number) {
        this.buffer = new Array<T | undefined>(capacity);
    }

    clear() {
        this.start = 0;
        this.count = 0;
        this.buffer.fill(undefined);
    }

    appendMany(items: T[]) {
        for (const item of items) {
            this.append(item);
        }
    }

    toArray(): T[] {
        const result = new Array<T>(this.count);

        for (let index = 0; index < this.count; index += 1) {
            result[index] = this.buffer[(this.start + index) % this.capacity]!;
        }

        return result;
    }

    private append(item: T) {
        const writeIndex = (this.start + this.count) % this.capacity;
        this.buffer[writeIndex] = item;

        if (this.count < this.capacity) {
            this.count += 1;
            return;
        }

        this.start = (this.start + 1) % this.capacity;
    }
}

const listeners = new Set<() => void>();
const ringBuffer = new RingBuffer<LogEntry>(LOG_BUFFER_CAPACITY);

let snapshot: LogStoreSnapshot = {
    logs: [],
    isWatching: false,
    error: null,
};

let nextLogId = 0;
let pendingLines: string[] = [];
let flushTimer: number | null = null;
let unwatch: (() => void) | null = null;
let startPromise: Promise<void> | null = null;

function emitSnapshot(nextPartial: Partial<LogStoreSnapshot> = {}) {
    snapshot = {
        ...snapshot,
        ...nextPartial,
    };

    for (const listener of listeners) {
        listener();
    }
}

function flushPendingLines() {
    if (pendingLines.length === 0) {
        return;
    }

    const lines = pendingLines;
    pendingLines = [];

    ringBuffer.appendMany(
        lines.map((line) => ({
            id: nextLogId++,
            raw: line,
            lower: line.toLowerCase(),
            parsed: parseLogLine(line),
        })),
    );

    emitSnapshot({ logs: ringBuffer.toArray() });
}

function ensureFlushTimer() {
    if (flushTimer !== null) {
        return;
    }

    flushTimer = window.setInterval(() => {
        flushPendingLines();
    }, FLUSH_INTERVAL_MS);
}

function clearFlushTimer() {
    if (flushTimer === null) {
        return;
    }

    window.clearInterval(flushTimer);
    flushTimer = null;
}

export const logStore = {
    clear() {
        pendingLines = [];
        nextLogId = 0;
        ringBuffer.clear();
        emitSnapshot({ logs: [] });
    },

    getSnapshot() {
        return snapshot;
    },

    async startWatching() {
        if (snapshot.isWatching) {
            return;
        }

        if (startPromise) {
            return startPromise;
        }

        emitSnapshot({ error: null });

        startPromise = attachLogger((record) => {
            pendingLines.push(record.message);
        })
            .then((dispose) => {
                unwatch = dispose;
                ensureFlushTimer();
                emitSnapshot({ isWatching: true, error: null });
            })
            .catch((error) => {
                emitSnapshot({ isWatching: false, error: `Failed to start file watcher: ${String(error)}` });
                throw error;
            })
            .finally(() => {
                startPromise = null;
            });

        return startPromise;
    },

    stopWatching() {
        if (unwatch) {
            unwatch();
            unwatch = null;
        }

        flushPendingLines();
        clearFlushTimer();
        emitSnapshot({ isWatching: false });
    },

    subscribe(listener: () => void) {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
};