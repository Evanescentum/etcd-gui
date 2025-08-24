import { useMemo } from "react";
import { Button, CloseButton, Dialog, Field, Text, VStack } from "@chakra-ui/react";
import { HiX } from "react-icons/hi";

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
                                <Field.Label>
                                    Value {textPatternIndicator}
                                </Field.Label>
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
