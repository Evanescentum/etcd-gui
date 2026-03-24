import { Box, type BoxProps } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useColorMode } from "./ui/color-mode";
import type { CSSProperties } from "react";
import type { HighlighterGeneric, ThemedToken, TokensResult } from "shiki";
import type { DetectedLanguage } from "../utils/languageDetect";
import { renderTimestampAnnotatedText } from "./TimestampAnnotation.tsx";

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

let highlighterPromise: Promise<HighlighterGeneric<any, any>> | null = null;

function getHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = import("shiki").then(({ createHighlighter }) => createHighlighter({
            langs: ["json", "yaml", "xml", "toml"],
            themes: ["one-dark-pro", "one-light"],
        }));
    }

    return highlighterPromise;
}

function toCamelCase(property: string) {
    return property.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function normalizeStyleObject(style: Record<string, string>) {
    const normalized: CSSProperties = {};

    for (const [property, value] of Object.entries(style)) {
        normalized[toCamelCase(property) as keyof CSSProperties] = value as never;
    }

    return normalized;
}

function getTokenStyle(token: ThemedToken) {
    if (token.htmlStyle) {
        return normalizeStyleObject(token.htmlStyle);
    }

    const style: CSSProperties = {};
    const fontStyle = token.fontStyle ?? 0;

    if (token.color) {
        style.color = token.color;
    }

    if (token.bgColor) {
        style.backgroundColor = token.bgColor;
    }

    if (fontStyle & FONT_STYLE_ITALIC) {
        style.fontStyle = "italic";
    }

    if (fontStyle & FONT_STYLE_BOLD) {
        style.fontWeight = "bold";
    }

    const decorations: string[] = [];
    if (fontStyle & FONT_STYLE_UNDERLINE) {
        decorations.push("underline");
    }
    if (fontStyle & FONT_STYLE_STRIKETHROUGH) {
        decorations.push("line-through");
    }
    if (decorations.length > 0) {
        style.textDecoration = decorations.join(" ");
    }

    return style;
}

function createPlaintextTokens(code: string): TokensResult {
    let offset = 0;
    const tokens = code.split(/\r?\n/).map((line) => {
        const lineTokens = line.length > 0 ? [{ content: line, offset }] : [];
        offset += line.length + 1;
        return lineTokens;
    });

    return { tokens };
}

interface CodeViewerProps extends Omit<BoxProps, "children"> {
    code: string;
    language: DetectedLanguage;
}

function CodeViewer({ code, language, ...boxProps }: CodeViewerProps) {
    const { colorMode } = useColorMode();
    const [tokensResult, setTokensResult] = useState<TokensResult>(() => createPlaintextTokens(code));

    useEffect(() => {
        let cancelled = false;

        if (language === "plaintext") {
            setTokensResult(createPlaintextTokens(code));
            return () => {
                cancelled = true;
            };
        }

        setTokensResult(createPlaintextTokens(code));

        getHighlighter()
            .then((highlighter) => highlighter.codeToTokens(code, {
                lang: language,
                theme: colorMode === "dark" ? "one-dark-pro" : "one-light",
            }))
            .then((result) => {
                if (!cancelled) {
                    setTokensResult(result);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setTokensResult(createPlaintextTokens(code));
                }
            });

        return () => {
            cancelled = true;
        };
    }, [code, colorMode, language]);

    return (
        <Box
            as="pre"
            m={0}
            fontFamily="mono"
            fontSize="sm"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
            color={tokensResult.fg}
            bg="transparent"
            {...boxProps}
        >
            {tokensResult.tokens.map((line, lineIndex) => (
                <Box key={`line-${lineIndex}`} as="span">
                    {line.map((token, tokenIndex) => {
                        const tokenStyle = getTokenStyle(token);

                        return (
                            <Box key={`token-${lineIndex}-${tokenIndex}`} as="span">
                                {renderTimestampAnnotatedText({
                                    text: token.content,
                                    fontSize: "sm",
                                    textStyle: tokenStyle,
                                    renderText: (part: string, key: string) => (
                                        <Box key={key} as="span" style={tokenStyle}>
                                            {part}
                                        </Box>
                                    ),
                                })}
                            </Box>
                        );
                    })}
                    {lineIndex < tokensResult.tokens.length - 1 ? "\n" : null}
                </Box>
            ))}
        </Box>
    );
}

export default CodeViewer;
