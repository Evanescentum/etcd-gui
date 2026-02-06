import { useState } from "react";
import { Text, VStack, HStack, IconButton, Box, TextProps } from "@chakra-ui/react";
import { LuCopy, LuClock } from "react-icons/lu";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "./ui/tooltip";
import { toaster } from "./ui/toaster";
import { parseTimestamp } from "../utils/timestamp";
import { formatTimestamp } from "../api/etcd";

interface TimestampChipProps {
    timestamp: string;
    fontSize?: TextProps["fontSize"];
}

/**
 * A chip component that displays a timestamp with a tooltip showing formatted dates
 * Includes copy functionality for each time format
 */
function TimestampChip({ timestamp, fontSize }: TimestampChipProps) {
    const [copied, setCopied] = useState<string | null>(null);

    const { data: formattedTime } = useQuery({
        queryKey: ['timestamp', timestamp],
        queryFn: () => formatTimestamp(parseTimestamp(timestamp)),
        staleTime: Infinity, // Timestamp formatting is deterministic, never stale
    });

    const handleCopy = async (text: string, label: string) => {
        try {
            await writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(null), 1500);
            toaster.create({
                title: "Copied",
                description: `${label} copied to clipboard`,
                type: "success",
                closable: true,
            });
        } catch (error) {
            toaster.create({
                title: "Copy failed",
                description: "Failed to copy to clipboard",
                type: "error",
                closable: true,
            });
        }
    };

    const tooltipContent = formattedTime ? (
        <VStack gap={2} align="stretch" minWidth="260px">
            {/* Header with original timestamp */}
            <HStack gap={2} justify="space-between" pb={1} borderBottomWidth="1px">
                <HStack gap={1.5} align="center">
                    <LuClock size={14} />
                    <Text fontSize="xs" fontWeight="bold" lineHeight="1">Timestamp</Text>
                    <Text fontSize="xs" fontFamily="mono" color="fg.muted" lineHeight="1">{timestamp}</Text>
                </HStack>
                <IconButton
                    size="xs"
                    variant="ghost"
                    onClick={() => handleCopy(timestamp, "Timestamp")}
                    disabled={copied === "Timestamp"}
                    aria-label="Copy timestamp"
                >
                    <LuCopy />
                </IconButton>
            </HStack>

            {/* UTC Time */}
            <HStack justify="space-between" align="center">
                <Box flex={1}>
                    <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={0.5}>UTC</Text>
                    <Text fontSize="xs" fontFamily="mono">{formattedTime.utc}</Text>
                </Box>
                <IconButton
                    size="xs"
                    variant="ghost"
                    onClick={() => handleCopy(formattedTime.utc, "UTC Time")}
                    disabled={copied === "UTC Time"}
                    aria-label="Copy UTC time"
                >
                    <LuCopy />
                </IconButton>
            </HStack>

            {/* Local Time */}
            <HStack justify="space-between" align="center">
                <Box flex={1}>
                    <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={0.5}>Local</Text>
                    <Text fontSize="xs" fontFamily="mono">{formattedTime.local}</Text>
                </Box>
                <IconButton
                    size="xs"
                    variant="ghost"
                    onClick={() => handleCopy(formattedTime.local, "Local Time")}
                    disabled={copied === "Local Time"}
                    aria-label="Copy local time"
                >
                    <LuCopy />
                </IconButton>
            </HStack>
        </VStack>
    ) : (
        <Text fontSize="xs">Loading...</Text>
    );

    return (
        <Tooltip
            content={tooltipContent}
            openDelay={300}
            interactive
            contentProps={{
                bg: "bg.panel",
                color: "fg",
                borderWidth: "1px",
                borderColor: "border",
                shadow: "lg",
                p: 3,
                borderRadius: "md"
            }}
        >
            <Text
                as="span"
                bg="blue.50"
                _dark={{ bg: "blue.800/50" }}
                px={1}
                borderRadius="sm"
                cursor="help"
                fontSize={fontSize}
                fontFamily="inherit"
            >
                {timestamp}
            </Text>
        </Tooltip>
    );
}

export default TimestampChip;
