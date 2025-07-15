import {
    Box,
    Button,
    CloseButton,
    Dialog,
    Text,
    VStack,
} from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { HiX } from "react-icons/hi"
import { useMutation } from "@tanstack/react-query";
import { toaster } from "../ui/toaster";
import { deleteEtcdItem } from "@/api/etcd";

interface DeleteKeyDialogProps {
    keyToDelete: string;
    valueToDelete: string;
    onClose: () => void;
    refetch: () => void;
}

function DeleteKeyDialog({
    keyToDelete,
    valueToDelete,
    onClose,
    refetch
}: DeleteKeyDialogProps) {
    const borderColor = useColorModeValue("gray.200", "gray.700");

    const { mutateAsync, isPending } = useMutation<void, String, { key: string }>({
        mutationFn: async ({ key }) => await deleteEtcdItem(key),
        onSuccess: () => refetch(),
        onError: (error: String) => {
            toaster.create({ type: "error", title: "Delete Key Failed", description: error, closable: true });
        },
    });

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
                            onClick={onClose}
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
                        <Button variant="outline" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            colorPalette="red"
                            onClick={() => mutateAsync({ key: keyToDelete }).then(onClose)}
                            loading={isPending}
                            loadingText="Deleting"
                            disabled={!keyToDelete.trim() || isPending}
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
