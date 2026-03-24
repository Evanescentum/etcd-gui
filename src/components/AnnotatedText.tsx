import { Text, TextProps } from "@chakra-ui/react";
import { renderTimestampAnnotatedText } from "./TimestampAnnotation.tsx";

interface AnnotatedTextProps extends TextProps {
    text: string;
}

/**
 * A Text component that automatically identifies and annotates Unix timestamps
 * with interactive tooltips showing formatted dates
 */
function AnnotatedText({ text, fontSize, ...props }: AnnotatedTextProps) {
    return (
        <Text fontSize={fontSize} {...props}>
            {renderTimestampAnnotatedText({
                text,
                fontSize,
                renderText: (part: string, key: string) => <Text key={key} as="span">{part}</Text>,
            })}
        </Text>
    );
}

export default AnnotatedText;
