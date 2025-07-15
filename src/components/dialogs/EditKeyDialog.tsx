import { useState, ChangeEvent } from "react";
import { Button, CloseButton, Dialog, Field, Input, VStack, Box, Textarea, Text } from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { putEtcdItem } from "@/api/etcd";
import { HiX } from "react-icons/hi";
import { toaster } from "../ui/toaster";
import { useMutation } from "@tanstack/react-query";

interface EditKeyDialogProps {
    keyToEdit: string;
    valueToEdit: string;
    onClose: () => void;
    refetch: () => void;
}

function EditKeyDialog({
    keyToEdit,
    valueToEdit,
    onClose,
    refetch
}: EditKeyDialogProps) {
    const [dialogKey, setDialogKey] = useState(keyToEdit);
    const [dialogValue, setDialogValue] = useState(valueToEdit);
    const [isKeyEditable, setIsKeyEditable] = useState(false);
    const { mutateAsync, isPending } = useMutation<void, String, { key: string, value: string }>({
        mutationFn: async ({ key, value }) => await putEtcdItem(key, value),
        onSuccess: () => refetch(),
        onError: (error: String) => {
            toaster.create({ type: "error", title: "Edit Key Failed", description: error, closable: true });
        },
    });

    return (
        <Dialog.Root modal={true} open={true}>
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content maxWidth="600px" width="90%">
                    <Dialog.Header>
                        <Dialog.Title>Edit Key</Dialog.Title>
                        <CloseButton
                            position="absolute"
                            right={4}
                            top={4}
                            size="sm"
                            onClick={onClose}
                        ><HiX /></CloseButton>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={4} align="stretch">
                            <Field.Root required>
                                <Field.Label>
                                    Key <Field.RequiredIndicator />
                                </Field.Label>
                                <Box position="relative">
                                    <Input
                                        fontFamily="mono"
                                        value={dialogKey}
                                        onChange={(e) => setDialogKey(e.target.value)}
                                        placeholder="Enter key path"
                                        readOnly={!isKeyEditable}
                                        bg={!isKeyEditable ? useColorModeValue("gray.100", "gray.700") : undefined}
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
                                    <Text fontFamily="moo" fontSize="xs" color="orange.500" mt={1}>
                                        Warning: Changing the key will create a new key-value pair and leave the old one intact
                                    </Text>
                                )}
                            </Field.Root>

                            <Field.Root required>
                                <Field.Label>
                                    Value <Field.RequiredIndicator />
                                </Field.Label>
                                <Textarea
                                    placeholder="Enter value (string, JSON, etc.)"
                                    fontFamily="mono"
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
                            colorScheme="blue"
                            onClick={() => mutateAsync({ key: dialogKey, value: dialogValue }).then(onClose)}
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
