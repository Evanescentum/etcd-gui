/**
 * Common props for code/technical content input fields.
 * Disables spell check, auto-correct, and auto-complete.
 * Prevents macOS smart punctuation replacement issues.
 * 
 * Usage:
 * <Input {...codeInputProps} />
 * <Textarea {...codeInputProps} />
 */
export const codeInputProps = {
    fontFamily: "mono",
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: false,
} as const;
