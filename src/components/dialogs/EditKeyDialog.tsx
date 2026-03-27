import { useState, ChangeEvent } from "react";
import { Button, CloseButton, Dialog, Field, Input, VStack, Box, Textarea, Text } from "@chakra-ui/react";
import { codeInputProps } from "@/utils/inputProps";
import { useColorModeValue } from "../../components/ui/color-mode";
import { putKey } from "@/api/etcd";
import { HiX } from "react-icons/hi";
import { toaster } from "../ui/toaster";
import { useMutation } from "@tanstack/react-query";

interface EditKeyDialogProps {
    keyToEdit: string;
    valueToEdit: string;
    onClose: () => void;
    onSuccess: () => Promise<void> | void;
}

function EditKeyDialog({
    keyToEdit,
    valueToEdit,
    onClose,
    onSuccess,
}: EditKeyDialogProps) {
    const [dialogKey, setDialogKey] = useState(keyToEdit);
    const [dialogValue, setDialogValue] = useState(valueToEdit);
    const [isKeyEditable, setIsKeyEditable] = useState(false);
    const readOnlyBackground = useColorModeValue("gray.100", "gray.700");
    const { mutateAsync, isPending } = useMutation<void, string, { key: string, value: string }>({
        mutationFn: async ({ key, value }) => await putKey(key, value),
        onSuccess: async () => {
            await onSuccess();
            onClose();
        },
        onError: (error: string) => {
            toaster.create({ type: "error", title: "Edit Key Failed", description: error, closable: true });
        },
    });

    return (
        <Dialog.Root modal={true} open={true} onOpenChange={(details) => { if (!details.open) onClose(); }}>
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content maxWidth="50%">
                    <Dialog.Header display="inline-flex" justifyContent="space-between" width="100%">
                        <Dialog.Title>Edit Key</Dialog.Title>
                        <CloseButton size="sm" onClick={onClose} ><HiX /></CloseButton>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={4} align="stretch">
                            <Field.Root required>
                                <Field.Label> Key <Field.RequiredIndicator /> </Field.Label>
                                <Box position="relative" width="100%">
                                    <Input
                                        {...codeInputProps}
                                        value={dialogKey}
                                        onChange={(e) => setDialogKey(e.target.value)}
                                        placeholder="Enter key path"
                                        readOnly={!isKeyEditable}
                                        bg={!isKeyEditable ? readOnlyBackground : undefined}
                                    />
                                    <Button
                                        position="absolute"
                                        right="2"
                                        top="50%"
                                        transform="translateY(-50%)"
                                        size="xs"
                                        onClick={() => setIsKeyEditable(!isKeyEditable)}
                                        variant="ghost"
                                    >
                                        {isKeyEditable ? "Lock" : "Edit Key"}
                                    </Button>
                                </Box>
                                {isKeyEditable && (
                                    <Text fontFamily="mono" fontSize="xs" color="orange.500" mt={1}>
                                        Warning: Changing the key will create a new key-value pair and leave the old one intact
                                    </Text>
                                )}
                            </Field.Root>

                            <Field.Root required>
                                <Field.Label>  Value <Field.RequiredIndicator /> </Field.Label>
                                <Textarea
                                    {...codeInputProps}
                                    maxHeight="45vh"
                                    placeholder="Enter value (string, JSON, etc.)"
                                    autoresize
                                    value={dialogValue}
                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDialogValue(e.target.value)}
                                />
                            </Field.Root>
                        </VStack>
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Button variant="outline" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void mutateAsync({ key: dialogKey, value: dialogValue })}
                            disabled={!dialogKey.trim() || !dialogValue.trim() || isPending}
                            loading={isPending}
                        >
                            Update
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default EditKeyDialog;
