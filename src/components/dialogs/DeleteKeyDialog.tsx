import {
    Box,
    Button,
    CloseButton,
    Dialog,
    Text,
    VStack,
} from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { deleteEtcdItem } from "../../api/etcd";
import { toaster } from "../../components/ui/toaster";
import { HiX } from "react-icons/hi"

interface DeleteKeyDialogProps {
    keyToDelete: string;
    valueToDelete: string;
    onSuccess: () => void;
    onCancel: () => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
}

function DeleteKeyDialog({
    keyToDelete,
    valueToDelete,
    onSuccess,
    onCancel,
    loading,
    setLoading
}: DeleteKeyDialogProps) {
    const borderColor = useColorModeValue("gray.200", "gray.700");

    const handleDeleteConfirm = async () => {
        if (!keyToDelete) return;

        try {
            setLoading(true); // Show loading state
            await deleteEtcdItem(keyToDelete);

            // Show success notification
            toaster.create({
                title: "Key deleted successfully",
                description: `Key: ${keyToDelete}`,
                closable: true,
                type: "success",
            });

            // Close the dialog and refresh the parent component
            onSuccess();
        } catch (error) {
            console.error("Failed to delete key:", error);
            toaster.create({
                title: "Error deleting key",
                description: error as string,
                closable: true,
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
                <Dialog.Content maxWidth="500px" width="90%">
                    <Dialog.Header>
                        <Dialog.Title>Confirm Delete</Dialog.Title>
                        <CloseButton
                            position="absolute"
                            size="sm"
                            top={4}
                            right={4}
                            onClick={onCancel}
                        ><HiX /></CloseButton>
                    </Dialog.Header>
                    <Dialog.Body>
                        <VStack gap={4} align="stretch">
                            <Text>
                                Are you sure you want to delete this key?
                            </Text>
                            <Box
                                p={3}
                                borderWidth="1px"
                                borderRadius="md"
                                borderColor={borderColor}
                                bg={useColorModeValue("gray.50", "gray.700")}
                            >
                                <Text fontFamily="mono" fontWeight="semibold" mb={1}>Key:</Text>
                                <Box
                                    p={2}
                                    borderWidth="1px"
                                    borderRadius="md"
                                    borderColor={useColorModeValue("gray.300", "gray.600")}
                                    bg={useColorModeValue("gray.100", "gray.800")}
                                    maxHeight="150px"
                                    overflowY="auto"
                                >
                                    <Text fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="break-word">
                                        {keyToDelete}
                                    </Text>
                                </Box>

                                <Text fontFamily="mono" fontWeight="semibold" mt={3} mb={1}>Value:</Text>
                                <Box
                                    p={2}
                                    borderWidth="1px"
                                    borderRadius="md"
                                    borderColor={useColorModeValue("gray.300", "gray.600")}
                                    bg={useColorModeValue("gray.100", "gray.800")}
                                    maxHeight="150px"
                                    overflowY="auto"
                                >
                                    <Text fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowWrap="break-word">
                                        {valueToDelete}
                                    </Text>
                                </Box>
                            </Box>
                            <Text color="red.500" fontSize="sm">
                                This action cannot be undone.
                            </Text>
                        </VStack>
                    </Dialog.Body>
                    <Dialog.Footer>
                        <Button variant="outline" mr={3} onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            colorPalette="red"
                            onClick={handleDeleteConfirm}
                            loading={loading}
                            loadingText="Deleting"
                        >
                            Delete
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default DeleteKeyDialog;
