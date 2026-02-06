import { Text, TextProps } from "@chakra-ui/react";
import { isValidTimestamp } from "../utils/timestamp";
import TimestampChip from "./TimestampChip";

interface AnnotatedTextProps extends TextProps {
    text: string;
}

/**
 * A Text component that automatically identifies and annotates Unix timestamps
 * with interactive tooltips showing formatted dates
 */
function AnnotatedText({ text, fontSize, ...props }: AnnotatedTextProps) {
    // Regular expression to match potential timestamps (10 or 13 digits)
    const timestampRegex = /\b(\d{10}|\d{13})\b/g;

    // Split text into parts, preserving the matched timestamps
    const parts: { text: string; isTimestamp: boolean }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = timestampRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push({
                text: text.slice(lastIndex, match.index),
                isTimestamp: false
            });
        }

        // Validate and add the potential timestamp
        const potentialTimestamp = match[0];
        if (isValidTimestamp(potentialTimestamp)) {
            parts.push({
                text: potentialTimestamp,
                isTimestamp: true
            });
        } else {
            // Not a valid timestamp, treat as regular text
            parts.push({
                text: potentialTimestamp,
                isTimestamp: false
            });
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last match
    if (lastIndex < text.length) {
        parts.push({
            text: text.slice(lastIndex),
            isTimestamp: false
        });
    }

    // If no parts were created, it means no matches were found
    if (parts.length === 0) {
        return <Text fontSize={fontSize} {...props}>{text}</Text>;
    }

    return (
        <Text fontSize={fontSize} {...props}>
            {parts.map((part, index) => {
                if (part.isTimestamp) {
                    return <TimestampChip key={index} timestamp={part.text} fontSize={fontSize} />;
                }
                return <Text key={index} as="span">{part.text}</Text>;
            })}
        </Text>
    );
}

export default AnnotatedText;
