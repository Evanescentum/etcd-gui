import { Profile, testConnection } from "@/api/etcd";
import { Dialog, CloseButton, VStack, Box, Button } from "@chakra-ui/react";
import { useState } from "react";
import { HiX } from "react-icons/hi";
import { LuRefreshCw } from "react-icons/lu";
import { useColorModeValue } from "../ui/color-mode";
import { toaster } from "../ui/toaster";
import {
    ProfileAdvancedFields,
    ProfileConnectionFields,
    useProfileFormState,
} from "../ProfileFormFields";

// Profile Edit Dialog Component
interface ProfileEditDialogProps {
    profile: Profile;
    onSave: (profile: Profile) => void;
    onCancel: () => void;
    loading: boolean;
    isNew: boolean;
}

function ProfileEditDialog({ profile, onSave, onCancel, loading, isNew }: ProfileEditDialogProps) {
    const [isLocked, setIsLocked] = useState(!!profile.locked);
    const [testingConnection, setTestingConnection] = useState(false);
    const profileForm = useProfileFormState(profile, { syncWithInitial: true });

    const borderColor = useColorModeValue("gray.200", "gray.700");

    const handleSave = () => {
        const finalProfile = {
            ...profileForm.buildProfile(),
            locked: isLocked
        };

        onSave(finalProfile);
    };

    const handleTestConnection = async () => {
        if (profileForm.profile.endpoints.length === 0) return;

        setTestingConnection(true);
        const profileToTest = profileForm.buildProfile();

        try {
            // Test the connection
            const version = await testConnection(profileToTest);

            toaster.create({
                title: "Connection Test",
                description: `Successfully connected to ${profileForm.profile.name}. Server version: ${version}`,
                type: "success",
                closable: true,
            });
        } catch (error) {
            toaster.create({
                title: "Connection Test Failed",
                description: typeof error === "string" ? error : "Unknown error",
                type: "error",
                closable: true,
            });
        } finally {
            setTestingConnection(false);
        }
    };

    return (
        <Dialog.Root modal={true} open={true} onOpenChange={(details) => { if (!details.open) onCancel(); }}>
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content maxWidth="600px">
                    <Dialog.Header>
                        <Dialog.Title>{isNew ? 'Create Profile' : 'Edit Profile'}</Dialog.Title>
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
                            <ProfileConnectionFields state={profileForm} />

                            <Box borderTopWidth="1px" borderColor={borderColor} pt={4} mt={2} />
                            <ProfileAdvancedFields
                                state={profileForm}
                                locked={isLocked}
                                onLockedChange={setIsLocked}
                            />

                            <Box borderTopWidth="1px" borderColor={borderColor} pt={4} mt={2} />
                        </VStack>
                    </Dialog.Body>
                    <Dialog.Footer>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleTestConnection}
                            loading={testingConnection}
                            loadingText="Testing"
                            disabled={
                                profileForm.profile.endpoints.length === 0 ||
                                loading ||
                                profileForm.hasValidationErrors
                            }
                            mr="auto" // Push to the left
                        >
                            <Box mr={2}><LuRefreshCw /></Box>
                            Test Connection
                        </Button>

                        <Button variant="outline" mr={3} onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            loading={loading}
                            disabled={
                                !profileForm.profile.name.trim() ||
                                profileForm.profile.endpoints.length === 0 ||
                                profileForm.hasValidationErrors
                            }
                        >
                            {isNew ? 'Create' : 'Save'}
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
}

export default ProfileEditDialog;