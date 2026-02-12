import { DataList, Heading, HoverCard, HStack, Mark, Text, TextProps } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { formatTimestamp } from "../api/etcd";
import { isValidTimestamp, parseTimestamp } from "../utils/timestamp";

interface AnnotatedTextProps extends TextProps {
    text: string;
}

interface TimestampMarkProps {
    timestamp: string;
    fontSize?: TextProps["fontSize"];
}

function TimestampMark({ timestamp, fontSize }: TimestampMarkProps) {
    const { data: formattedTime } = useQuery({
        queryKey: ["timestamp", timestamp],
        queryFn: () => formatTimestamp(parseTimestamp(timestamp)),
        staleTime: Infinity,
    });

    return (
        <HoverCard.Root openDelay={300} positioning={{ placement: "top" }}>
            <HoverCard.Trigger asChild>
                <Mark px={1} colorPalette="blue" variant="subtle" fontSize={fontSize}>
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
                            <DataList.ItemValue>{formattedTime?.local ?? "Loading..."}</DataList.ItemValue>
                        </DataList.Item>
                        <DataList.Item>
                            <DataList.ItemLabel width="3em" minW="0">UTC</DataList.ItemLabel>
                            <DataList.ItemValue>{formattedTime?.utc ?? "Loading..."}</DataList.ItemValue>
                        </DataList.Item>
                    </DataList.Root>
                </HoverCard.Content>
            </HoverCard.Positioner>
        </HoverCard.Root>
    );
}

/**
 * A Text component that automatically identifies and annotates Unix timestamps
 * with interactive tooltips showing formatted dates
 */
function AnnotatedText({ text, fontSize, ...props }: AnnotatedTextProps) {
    const parts = text.split(/(\b(?:\d{10}|\d{13})\b)/g);

    if (parts.length <= 1) {
        return <Text fontSize={fontSize} {...props}>{text}</Text>;
    }

    return (
        <Text fontSize={fontSize} {...props}>
            {parts.map((part, index) => {
                if (!part) {
                    return null;
                }
                if (isValidTimestamp(part)) {
                    return <TimestampMark key={index} timestamp={part} fontSize={fontSize} />;
                }
                return <Text key={index} as="span">{part}</Text>;
            })}
        </Text>
    );
}

export default AnnotatedText;
