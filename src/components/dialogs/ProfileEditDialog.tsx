import { Profile, testConnection } from "@/api/etcd";
import { Dialog, CloseButton, VStack, Box, Input, Flex, Field, Text, IconButton, Button, Switch } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { HiX } from "react-icons/hi";
import { LuTrash2, LuPlus, LuLockOpen, LuLock, LuRefreshCw } from "react-icons/lu";
import { useColorModeValue } from "../ui/color-mode";
import { PasswordInput } from "../ui/password-input";
import { toaster } from "../ui/toaster";
import { Tooltip } from "../ui/tooltip";

// Profile Edit Dialog Component
interface ProfileEditDialogProps {
    profile: Profile;
    onSave: (profile: Profile) => void;
    onCancel: () => void;
    loading: boolean;
    isNew: boolean;
}

function ProfileEditDialog({ profile, onSave, onCancel, loading, isNew }: ProfileEditDialogProps) {
    const [editedProfile, setEditedProfile] = useState<Profile>(profile);
    const [useAuth, setUseAuth] = useState(!!profile.user?.length);
    const [isLocked, setIsLocked] = useState(!!profile.locked);
    const [testingConnection, setTestingConnection] = useState(false);

    // Add validation state
    const [validationErrors, setValidationErrors] = useState({
        port: '',
        timeout: '',
        connectTimeout: ''
    });

    const borderColor = useColorModeValue("gray.200", "gray.700");

    useEffect(() => {
        setEditedProfile(profile);
        setUseAuth(!!profile.user?.length);
        setIsLocked(!!profile.locked);
    }, [profile]);

    const handleSave = () => {
        // Prepare the final profile object
        const finalProfile = {
            ...editedProfile,
            user: useAuth ? editedProfile.user : undefined,
            locked: isLocked
        };

        onSave(finalProfile);
    };

    const addEndpoint = () => {
        setEditedProfile({
            ...editedProfile,
            endpoints: [
                ...editedProfile.endpoints,
                { host: "http://localhost", port: 2379 }
            ]
        });
    };

    const removeEndpoint = (index: number) => {
        if (editedProfile.endpoints.length <= 1) return;

        const newEndpoints = [...editedProfile.endpoints];
        newEndpoints.splice(index, 1);

        setEditedProfile({
            ...editedProfile,
            endpoints: newEndpoints
        });
    };

    const validatePort = (port: number): string => {
        if (port < 1 || port > 65535) {
            return 'Port must be between 1 and 65535';
        }
        return '';
    };

    const validateTimeout = (timeout: number | undefined): string => {
        if (timeout !== undefined && timeout < 100) {
            return 'Timeout should be at least 100ms';
        }
        if (timeout !== undefined && timeout > 60000) {
            return 'Timeout should not exceed 60000ms (60 seconds)';
        }
        return '';
    };

    const updateEndpoint = (index: number, field: 'host' | 'port', value: string | number) => {
        const newEndpoints = [...editedProfile.endpoints];

        if (field === 'port') {
            const portValue = typeof value === 'string' ? parseInt(value, 10) : value;
            const error = validatePort(portValue);
            setValidationErrors(prev => ({ ...prev, port: error }));
        }

        newEndpoints[index] = {
            ...newEndpoints[index],
            [field]: value
        };

        setEditedProfile({
            ...editedProfile,
            endpoints: newEndpoints
        });
    };

    const handleTestConnection = async () => {
        // Only test if we have at least one endpoint
        if (editedProfile.endpoints.length === 0) return;

        setTestingConnection(true);

        // Prepare the profile with auth settings for testing
        const profileToTest = {
            ...editedProfile,
            user: useAuth ? editedProfile.user : undefined
        };

        try {
            // Test the connection
            const version = await testConnection(profileToTest);

            // Show success message with the version
            toaster.create({
                title: "Connection Test",
                description: `Successfully connected to ${editedProfile.name}. Server version: ${version}`,
                type: "success",
                meta: { closable: true },
            });
        } catch (error) {
            // Show error message
            toaster.create({
                title: "Connection Test Failed",
                description: typeof error === "string" ? error : "Unknown error",
                type: "error",
                meta: { closable: true },
            });
        } finally {
            setTestingConnection(false);
        }
    };

    return (
        <Dialog.Root modal={true} open={true}>
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
                            <Box>
                                <Text fontWeight="medium" mb={1}>Profile Name</Text>
                                <Input
                                    value={editedProfile.name}
                                    onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
                                    placeholder="Enter profile name"
                                />
                            </Box>

                            <Box>
                                <Text fontWeight="medium" mb={2}>Endpoints</Text>
                                <VStack gap={3} align="stretch">
                                    {editedProfile.endpoints.map((endpoint, index) => (
                                        <Flex key={index} gap={2}>
                                            <Input
                                                flex={3}
                                                value={endpoint.host}
                                                onChange={(e) => updateEndpoint(index, 'host', e.target.value)}
                                                placeholder="Host (e.g. http://localhost)"
                                            />
                                            <Field.Root invalid={!!validationErrors.port} flex={1}>
                                                <Input
                                                    value={endpoint.port}
                                                    onChange={(e) => {
                                                        const value = parseInt(e.target.value, 10);
                                                        if (!isNaN(value)) {
                                                            updateEndpoint(index, 'port', value);
                                                        }
                                                    }}
                                                    placeholder="Port"
                                                />
                                                {validationErrors.port && (
                                                    <Field.ErrorText>{validationErrors.port}</Field.ErrorText>
                                                )}
                                            </Field.Root>
                                            <Tooltip content="Remove endpoint" showArrow>
                                                <IconButton
                                                    aria-label="Remove endpoint"
                                                    children={<LuTrash2 />}
                                                    colorScheme="red"
                                                    variant="ghost"
                                                    onClick={() => removeEndpoint(index)}
                                                    disabled={editedProfile.endpoints.length <= 1}
                                                />
                                            </Tooltip>
                                        </Flex>
                                    ))}
                                </VStack>
                                <Button
                                    size="sm"
                                    onClick={addEndpoint}
                                    mt={2}
                                >
                                    <Box mr={2}><LuPlus /></Box>
                                    Add Endpoint
                                </Button>
                            </Box>

                            <Box borderTopWidth="1px" borderColor={borderColor} pt={4} mt={2} />

                            <Flex align="center" justify="space-between">
                                <Text fontWeight="medium">Authentication</Text>
                                <Box as="label" display="flex" alignItems="center" cursor="pointer">
                                    <Switch.Root checked={useAuth} onCheckedChange={(e) => setUseAuth(e.checked)}>
                                        <Switch.HiddenInput />
                                        <Switch.Control />
                                        <Switch.Label ml={2}>{useAuth ? 'Enabled' : 'Disabled'}</Switch.Label>
                                    </Switch.Root>
                                </Box>
                            </Flex>

                            {useAuth && (
                                <VStack gap={3} align="stretch">
                                    <Box>
                                        <Text fontWeight="medium" mb={1}>Username</Text>
                                        <Input
                                            value={editedProfile.user?.[0] || ""}
                                            onChange={(e) => setEditedProfile({
                                                ...editedProfile,
                                                user: [e.target.value, editedProfile.user?.[1] || ""]
                                            })}
                                            placeholder="Username"
                                        />
                                    </Box>
                                    <Box>
                                        <Text fontWeight="medium" mb={1}>Password</Text>
                                        <PasswordInput
                                            value={editedProfile.user?.[1] || ""}
                                            onChange={(e) => setEditedProfile({
                                                ...editedProfile,
                                                user: [editedProfile.user?.[0] || "", e.target.value]
                                            })}
                                            placeholder="Password"
                                        />
                                    </Box>
                                </VStack>
                            )}

                            <Box borderTopWidth="1px" borderColor={borderColor} pt={4} mt={2} />

                            <Field.Root invalid={!!validationErrors.timeout}>
                                <Field.Label>Timeout (ms)</Field.Label>
                                <Input
                                    value={editedProfile.timeout_ms === undefined ? '' : editedProfile.timeout_ms}
                                    onChange={(e) => {
                                        const value = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                                        if (value === undefined || !isNaN(value)) {
                                            const error = validateTimeout(value);
                                            setValidationErrors(prev => ({ ...prev, timeout: error }));
                                            setEditedProfile({ ...editedProfile, timeout_ms: value });
                                        }
                                    }}
                                    placeholder="Timeout in milliseconds"
                                />
                                {validationErrors.timeout && (
                                    <Field.ErrorText>{validationErrors.timeout}</Field.ErrorText>
                                )}
                            </Field.Root>

                            <Field.Root invalid={!!validationErrors.connectTimeout}>
                                <Field.Label>Connection Timeout (ms)</Field.Label>
                                <Input
                                    value={editedProfile.connect_timeout_ms === undefined ? '' : editedProfile.connect_timeout_ms}
                                    onChange={(e) => {
                                        const value = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                                        if (value === undefined || !isNaN(value)) {
                                            const error = validateTimeout(value);
                                            setValidationErrors(prev => ({ ...prev, connectTimeout: error }));
                                            setEditedProfile({ ...editedProfile, connect_timeout_ms: value });
                                        }
                                    }}
                                    placeholder="Connection timeout in milliseconds"
                                />
                                {validationErrors.connectTimeout && (
                                    <Field.ErrorText>{validationErrors.connectTimeout}</Field.ErrorText>
                                )}
                            </Field.Root>

                            <Box borderTopWidth="1px" borderColor={borderColor} pt={4} mt={2} />

                            <Flex align="center" justify="space-between">
                                <Box>
                                    <Text fontWeight="medium">Read-only Mode</Text>
                                    <Text fontSize="sm" color="gray.500" mt={1}>
                                        When enabled, this profile cannot be used to modify server data
                                    </Text>
                                </Box>
                                <Switch.Root size="lg" checked={isLocked} onCheckedChange={(e) => setIsLocked(e.checked)}>
                                    <Switch.HiddenInput />
                                    <Switch.Control>
                                        <Switch.Thumb>
                                            <Switch.ThumbIndicator fallback={<LuLockOpen color="black" />} ><LuLock /></Switch.ThumbIndicator>
                                        </Switch.Thumb>
                                    </Switch.Control>
                                </Switch.Root>
                            </Flex>

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
                                editedProfile.endpoints.length === 0 ||
                                loading ||
                                !!validationErrors.port ||
                                !!validationErrors.timeout ||
                                !!validationErrors.connectTimeout
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
                            colorScheme="blue"
                            onClick={handleSave}
                            loading={loading}
                            disabled={
                                !editedProfile.name.trim() ||
                                editedProfile.endpoints.length === 0 ||
                                !!validationErrors.port ||
                                !!validationErrors.timeout ||
                                !!validationErrors.connectTimeout
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