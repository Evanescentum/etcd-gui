import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import xmlFormatter from "xml-formatter";

export type DetectedLanguage = "json" | "yaml" | "xml" | "toml" | "plaintext";

export interface DetectionResult {
    language: DetectedLanguage;
    formatted: string;
}

function tryJson(text: string): DetectionResult | null {
    try {
        const parsed = JSON.parse(text);
        return { language: "json", formatted: JSON.stringify(parsed, null, 2) };
    } catch {
        return null;
    }
}

function tryToml(text: string): DetectionResult | null {
    try {
        const parsed = parseToml(text);
        if (typeof parsed !== "object" || parsed === null) return null;
        return { language: "toml", formatted: stringifyToml(parsed) };
    } catch {
        return null;
    }
}

function tryXml(text: string): DetectionResult | null {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("<")) return null;
    try {
        const formatted = xmlFormatter(text, { indentation: "  ", collapseContent: true, lineSeparator: "\n" });
        return { language: "xml", formatted };
    } catch {
        return null;
    }
}

function tryYaml(text: string): DetectionResult | null {
    try {
        const parsed = parseYaml(text);
        // Only consider it YAML if the result is an object or array, not a plain scalar
        if (typeof parsed !== "object" || parsed === null) return null;
        return { language: "yaml", formatted: stringifyYaml(parsed, { indent: 2 }) };
    } catch {
        return null;
    }
}

/**
 * Detect the language/format of a text string and return a formatted version.
 * Detection order: JSON → TOML → XML → YAML → plaintext
 */
export function detectLanguage(text: string): DetectionResult {
    return (
        tryJson(text) ??
        tryToml(text) ??
        tryXml(text) ??
        tryYaml(text) ??
        { language: "plaintext", formatted: text }
    );
}
