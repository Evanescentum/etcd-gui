import { useState, ChangeEvent } from "react";
import { putKey } from "../../api/etcd";
import { Button, CloseButton, Dialog, Field, Input, Textarea, VStack } from "@chakra-ui/react";
import { codeInputProps } from "@/utils/inputProps";

import { HiX } from "react-icons/hi";
import { useMutation } from "@tanstack/react-query";
import { toaster } from "../ui/toaster";


interface AddKeyDialogProps {
    defaultKeyPrefix: string;
    onClose: () => void;
    onSuccess: () => Promise<void> | void;
}

function AddKeyDialog({
    defaultKeyPrefix,
    onClose,
    onSuccess,
}: AddKeyDialogProps) {
    const [dialogNewKey, setDialogNewKey] = useState(defaultKeyPrefix);
    const [dialogNewValue, setDialogNewValue] = useState("");
    const { mutateAsync, isPending } = useMutation<void, string, { key: string, value: string }>({
        mutationFn: async ({ key, value }) => await putKey(key, value),
        onSuccess: async () => {
            await onSuccess();
            onClose();
        },
        onError: (error: string) => {
            console.error("Failed to add etcd item:", error);
            toaster.create({ type: "error", title: "Add Key Failed", description: error, closable: true });
        },
    });

    return (
        <Dialog.Root modal={true} open={true} onOpenChange={(details) => { if (!details.open) onClose(); }}>
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
                            onClick={onClose}
                        ><HiX /></CloseButton>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={4} align="stretch">
                            <Field.Root required>
                                <Field.Label>
                                    Key <Field.RequiredIndicator />
                                </Field.Label>
                                <Input
                                    {...codeInputProps}
                                    value={dialogNewKey}
                                    onChange={(e) => setDialogNewKey(e.target.value)}
                                    placeholder="Enter key path (e.g. /config/app)"
                                />
                            </Field.Root>

                            <Field.Root required>
                                <Field.Label>
                                    Value <Field.RequiredIndicator />
                                </Field.Label>
                                <Textarea
                                    {...codeInputProps}
                                    maxHeight="45vh"
                                    placeholder="Enter value (string, JSON, etc.)"
                                    autoresize
                                    value={dialogNewValue}
                                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDialogNewValue(e.target.value)}
                                />
                            </Field.Root>
                        </VStack>
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Button variant="outline" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={() => void mutateAsync({ key: dialogNewKey, value: dialogNewValue })}
                            loading={isPending} disabled={!dialogNewKey.trim() || !dialogNewValue.trim() || isPending}>
                            Add
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default AddKeyDialog;
