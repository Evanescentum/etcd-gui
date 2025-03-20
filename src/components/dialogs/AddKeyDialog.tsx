import { useState, ChangeEvent } from "react";
import {
    Button,
    CloseButton,
    Dialog,
    Field,
    Input,
    Textarea,
    VStack,
} from "@chakra-ui/react";
import { putEtcdItem } from "../../api/etcd";
import { toaster } from "../../components/ui/toaster";
import { HiX } from "react-icons/hi";

interface AddKeyDialogProps {
    defaultKeyPrefix: string;
    onSuccess: () => void;
    onCancel: () => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
}

function AddKeyDialog({
    defaultKeyPrefix,
    onSuccess,
    onCancel,
    loading,
    setLoading
}: AddKeyDialogProps) {
    // Dialog state
    const [dialogNewKey, setDialogNewKey] = useState(defaultKeyPrefix);
    const [dialogNewValue, setDialogNewValue] = useState("");

    const handleAddConfirm = async () => {
        if (!dialogNewKey.trim() || !dialogNewValue.trim()) return;

        try {
            setLoading(true); // Show loading state
            await putEtcdItem(dialogNewKey, dialogNewValue);

            // Show success notification
            toaster.create({
                title: "Key added successfully",
                description: `Key: ${dialogNewKey}`,
                meta: { closable: true },
                type: "success",
            });

            // Close the dialog and refresh the parent component
            onSuccess();

            // Reset the form
            setDialogNewKey("");
            setDialogNewValue("");
        } catch (error) {
            console.error("Failed to add key:", error);
            toaster.create({
                title: "Error adding key",
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
                        <Dialog.Title>Add New Key</Dialog.Title>
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
                                <Input
                                    fontFamily="mono"
                                    value={dialogNewKey}
                                    onChange={(e) => setDialogNewKey(e.target.value)}
                                    placeholder="Enter key path (e.g. /config/app)"
                                />
                            </Field.Root>

                            <Field.Root required>
                                <Field.Label>
                                    Value <Field.RequiredIndicator />
                                </Field.Label>
                                {/* Using a controlled textarea with proper event handling */}
                                <Textarea
                                    placeholder="Enter value (string, JSON, etc.)"
                                    autoresize
                                    fontFamily="mono"
                                    value={dialogNewValue}
                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDialogNewValue(e.target.value)}
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
                            onClick={handleAddConfirm}
                            disabled={!dialogNewKey.trim() || !dialogNewValue.trim() || loading}
                            loading={loading}
                        >
                            Add Key
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default AddKeyDialog;
