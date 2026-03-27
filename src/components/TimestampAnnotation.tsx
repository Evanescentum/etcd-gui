import { DataList, Heading, HoverCard, HStack, Mark, type TextProps } from "@chakra-ui/react";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { formatTimestamp, parseTimestamp, splitTextByTimestamps } from "../utils/timestamp";

export interface TimestampMarkProps {
    timestamp: string;
    fontSize?: TextProps["fontSize"];
    textStyle?: CSSProperties;
}

interface RenderTimestampAnnotatedTextOptions {
    text: string;
    fontSize?: TextProps["fontSize"];
    textStyle?: CSSProperties;
    renderText: (part: string, key: string) => ReactNode;
}

export function TimestampMark({ timestamp, fontSize, textStyle }: TimestampMarkProps) {
    const formattedTime = useMemo(() => formatTimestamp(parseTimestamp(timestamp)), [timestamp]);

    return (
        <HoverCard.Root openDelay={300} positioning={{ placement: "top" }}>
            <HoverCard.Trigger asChild>
                <Mark px={1} colorPalette="blue" variant="subtle" fontSize={fontSize} style={textStyle}>
                    {timestamp}
                </Mark>
            </HoverCard.Trigger>
            <HoverCard.Positioner>
                <HoverCard.Content>
                    <HoverCard.Arrow>
                        <HoverCard.ArrowTip />
                    </HoverCard.Arrow>
                    <HStack gap={1.5} align="center">
                        <Heading fontSize="xs" fontWeight="bold" lineHeight="1.5">Timestamp</Heading>
                        <Heading fontSize="xs">{timestamp}</Heading>
                    </HStack>
                    <DataList.Root orientation="horizontal" size="sm" mt={2}>
                        <DataList.Item>
                            <DataList.ItemLabel width="3em" minW="0">Local</DataList.ItemLabel>
                            <DataList.ItemValue>{formattedTime.local}</DataList.ItemValue>
                        </DataList.Item>
                        <DataList.Item>
                            <DataList.ItemLabel width="3em" minW="0">UTC</DataList.ItemLabel>
                            <DataList.ItemValue>{formattedTime.utc}</DataList.ItemValue>
                        </DataList.Item>
                    </DataList.Root>
                </HoverCard.Content>
            </HoverCard.Positioner>
        </HoverCard.Root>
    );
}

export function renderTimestampAnnotatedText({
    text,
    fontSize,
    textStyle,
    renderText,
}: RenderTimestampAnnotatedTextOptions) {
    const parts = splitTextByTimestamps(text);

    return parts.map((part, index) => {
        const key = `${index}-${part.value.length}`;
        if (part.type === "timestamp") {
            return <TimestampMark key={key} timestamp={part.value} fontSize={fontSize} textStyle={textStyle} />;
        }

        return renderText(part.value, key);
    });
}