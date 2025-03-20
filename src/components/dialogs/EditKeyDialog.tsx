import { useState, ChangeEvent } from "react";
import {
    Button,
    CloseButton,
    Dialog,
    Field,
    Input,
    VStack,
    Text,
    Box,
    Textarea,
} from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { putEtcdItem } from "../../api/etcd";
import { toaster } from "../../components/ui/toaster";
import { HiX } from "react-icons/hi";

interface EditKeyDialogProps {
    keyToEdit: string;
    valueToEdit: string;
    onSuccess: () => void;
    onCancel: () => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
}

function EditKeyDialog({
    keyToEdit,
    valueToEdit,
    onSuccess,
    onCancel,
    loading,
    setLoading
}: EditKeyDialogProps) {
    // Dialog state
    const [dialogKey, setDialogKey] = useState(keyToEdit);
    const [dialogValue, setDialogValue] = useState(valueToEdit);
    const [isKeyEditable, setIsKeyEditable] = useState(false);

    const handleEditConfirm = async () => {
        if (!dialogKey.trim() || !dialogValue.trim()) return;

        try {
            setLoading(true);

            // Update the key-value pair
            await putEtcdItem(dialogKey, dialogValue);

            // Show success notification
            toaster.create({
                title: "Key updated successfully",
                description: `Key: ${dialogKey}`,
                meta: { closable: true },
                type: "success",
            });

            // Close the dialog and refresh the parent component
            onSuccess();
        } catch (error) {
            console.error("Failed to update key:", error);
            toaster.create({
                title: "Error updating key",
                description: error as string,
                meta: { closable: true },
                type: "error",
            });
        } finally {
            setLoading(false);
        }
    };

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
                            onClick={onCancel}
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
                        <Button variant="outline" mr={3} onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleEditConfirm}
                            disabled={!dialogKey.trim() || !dialogValue.trim() || loading}
                            loading={loading}
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
