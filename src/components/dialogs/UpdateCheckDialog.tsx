import {
    Badge,
    Button,
    Collapsible,
    Dialog,
    Heading,
    HStack,
    Icon,
    ScrollArea,
    Text,
    VStack,
} from "@chakra-ui/react";
import type { UpdateCheckResult } from "../../api/etcd";
import { LuChevronDown, LuExternalLink, LuMoveRight } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prose } from "../ui/prose";
import { toaster } from "../ui/toaster";
import { openUrl } from "@tauri-apps/plugin-opener";

interface UpdateCheckDialogProps {
    onClose: () => void;
    result: UpdateCheckResult;
}

function formatPublishedAt(value: string | null | undefined): string {
    if (!value) {
        return "(unknown)";
    }

    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
        return value;
    }

    return dt.toLocaleString();
}


const handleOpenRelease = async (url: string) => {
    try {
        await openUrl(url);
    } catch {
        toaster.create({ title: "Error", description: "Failed to open release page", type: "error" });
    }
};

function UpdateCheckDialog({ onClose, result }: UpdateCheckDialogProps) {
    const release = result.release;
    const notesTitle = result.update_available
        ? (release.name.trim() || result.release.version)
        : (release.name.trim() || result.current_version);

    const title = result.update_available
        ? "New version available!"
        : "You're up to date!";

    return (
        <Dialog.Root defaultOpen onOpenChange={(e) => { if (!e.open) onClose(); }}>
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content maxWidth="820px">
                    <Dialog.Header>
                        <Dialog.Title>{title}</Dialog.Title>
                    </Dialog.Header>

                    <Dialog.Body>
                        <VStack align="stretch" gap={4}>
                            <HStack align="center" gap={2} wrap="wrap">
                                <Text fontWeight="medium" fontSize="md">{result.current_version}</Text>
                                {result.update_available ? (
                                    <>
                                        <Icon strokeWidth="4" ><LuMoveRight /></Icon>
                                        <HStack gap={1}>
                                            <Text fontWeight="medium" fontSize="md">{release.version}</Text>
                                            {release.prerelease && (
                                                <Badge colorPalette="orange" variant="subtle" size="sm">Pre-release</Badge>
                                            )}
                                        </HStack>
                                    </>
                                ) : <Badge colorPalette="green" variant="subtle" size="sm">Latest</Badge>}
                            </HStack>

                            {release && (
                                <Collapsible.Root
                                    defaultOpen={result.update_available}
                                    collapsedHeight={!result.update_available ? "10rem" : undefined}
                                >
                                    <HStack justify="space-between" align="center" gap={2} mb={2}>
                                        <Heading fontWeight="semibold">{notesTitle}</Heading>
                                        <Text color="fg.muted" fontSize="sm">{formatPublishedAt(release.published_at)}</Text>
                                    </HStack>
                                    <Collapsible.Content borderWidth="2px">
                                        <ScrollArea.Root maxH="45vh" borderRadius="md">
                                            <ScrollArea.Viewport>
                                                <ScrollArea.Content p={4}>
                                                    <Prose maxW="100%">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {release.body?.trim() ? release.body : "(No release notes)"}
                                                        </ReactMarkdown>
                                                    </Prose>
                                                </ScrollArea.Content>
                                            </ScrollArea.Viewport>
                                            <ScrollArea.Scrollbar />
                                            <ScrollArea.Corner />
                                        </ScrollArea.Root>
                                    </Collapsible.Content>
                                    {!result.update_available && (
                                        <Collapsible.Trigger asChild>
                                            <Button variant="outline" size="sm" justifySelf="start">
                                                <Collapsible.Context>
                                                    {(api) => (api.open ? "Show Less" : "Show More")}
                                                </Collapsible.Context>
                                                <Collapsible.Indicator
                                                    transition="transform 0.2s"
                                                    _open={{ transform: "rotate(180deg)" }}
                                                >
                                                    <LuChevronDown />
                                                </Collapsible.Indicator>
                                            </Button>
                                        </Collapsible.Trigger>
                                    )}
                                </Collapsible.Root>
                            )}
                        </VStack>
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Button variant="outline" onClick={() => release?.html_url && handleOpenRelease(release.html_url)}>
                            <HStack>
                                <LuExternalLink />
                                <Text>View Release</Text>
                            </HStack>
                        </Button>
                        <Button variant="outline" onClick={onClose}>Close</Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default UpdateCheckDialog;
