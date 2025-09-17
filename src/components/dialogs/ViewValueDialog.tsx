import { useMemo } from "react";
import { Button, CloseButton, Dialog, Field, Text, VStack, IconButton, HStack } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toaster } from "../ui/toaster";
import { LuCopy } from "react-icons/lu";

interface ViewValueDialogProps {
    keyToView: string;
    valueToView: string;
    onClose: () => void;
}

function ViewValueDialog({ keyToView, valueToView, onClose }: ViewValueDialogProps) {
    const { isJson, pretty } = useMemo(() => {
        try {
            const parsed = JSON.parse(valueToView);
            return { isJson: true, pretty: JSON.stringify(parsed, null, 2) };
        } catch {
            return { isJson: false, pretty: valueToView };
        }
    }, [valueToView]);

    const handleCopyValue = async () => {
        try {
            await writeText(pretty);
            toaster.create({
                title: "复制成功",
                description: "值已复制到剪贴板",
                type: "success",
                closable: true,
            });
        } catch (error) {
            toaster.create({
                title: "复制失败",
                description: "无法复制到剪贴板",
                type: "error",
                closable: true,
            });
        }
    };

    const textPatternIndicator = isJson ? <Text as="span" fontSize="xs" color="green.500">(JSON, pretty)</Text> : null;

    return (
        <Dialog.Root open>
            <Dialog.Backdrop onClick={onClose} />
            <Dialog.Positioner>
                <Dialog.Content maxWidth="800px" width="90%">
                    <Dialog.Header>
                        <Dialog.Title>View Value</Dialog.Title>
                        <CloseButton position="absolute" right={4} top={4} size="sm" onClick={onClose}>
                            <HiX />
                        </CloseButton>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={4} align="stretch">
                            <Field.Root>
                                <Field.Label>Key</Field.Label>
                                <Text borderWidth="1px" borderRadius="md" padding={2} width="100%" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">
                                    {keyToView}
                                </Text>
                            </Field.Root>

                            <Field.Root>
                                <HStack justify="space-between" align="center" width="100%">
                                    <Field.Label>
                                        Value {textPatternIndicator}
                                    </Field.Label>
                                    <IconButton
                                        size="sm"
                                        variant="subtle"
                                        onClick={handleCopyValue}
                                        alignSelf="flex-end"
                                    >
                                        <LuCopy />
                                    </IconButton>
                                </HStack>
                                <Text borderWidth="1px" borderRadius="md" padding={2} width="100%" fontFamily="mono" fontSize="sm" whiteSpace="pre" overflowWrap="normal" display="block">
                                    {pretty}
                                </Text>
                            </Field.Root>
                        </VStack>
                    </Dialog.Body>
                    <Dialog.Footer>
                        <Button onClick={onClose}>Close</Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default ViewValueDialog;
