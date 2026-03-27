import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Field,
    Flex,
    IconButton,
    Input,
    Switch,
    Text,
    VStack,
} from "@chakra-ui/react";
import { LuLock, LuLockOpen, LuPlus, LuTrash2 } from "react-icons/lu";
import type { Profile } from "@/api/etcd";
import { codeInputProps } from "@/utils/inputProps";
import { Tooltip } from "@/components/ui/tooltip";
import { PasswordInput } from "@/components/ui/password-input";

export interface ProfileValidationErrors {
    port: string;
    timeout: string;
    connectTimeout: string;
}

interface UseProfileFormStateOptions {
    syncWithInitial?: boolean;
}

export interface ProfileFormState {
    profile: Profile;
    useAuth: boolean;
    validationErrors: ProfileValidationErrors;
    hasValidationErrors: boolean;
    addEndpoint: () => void;
    removeEndpoint: (index: number) => void;
    updateEndpoint: (index: number, field: "host" | "port", value: string | number) => void;
    setProfileName: (name: string) => void;
    setUsername: (username: string) => void;
    setPassword: (password: string) => void;
    setTimeoutMs: (value: number | undefined) => void;
    setConnectTimeoutMs: (value: number | undefined) => void;
    setMetricsPath: (value: string) => void;
    setUseAuth: (value: boolean) => void;
    buildProfile: () => Profile;
}

const emptyValidationErrors = (): ProfileValidationErrors => ({
    port: "",
    timeout: "",
    connectTimeout: "",
});

function validatePort(port: number): string {
    if (port < 1 || port > 65535) {
        return "Port must be between 1 and 65535";
    }

    return "";
}

function validateTimeout(timeout: number | undefined): string {
    if (timeout !== undefined && timeout < 100) {
        return "Timeout should be at least 100ms";
    }

    if (timeout !== undefined && timeout > 60000) {
        return "Timeout should not exceed 60000ms (60 seconds)";
    }

    return "";
}

export function useProfileFormState(
    initialProfile: Profile,
    options: UseProfileFormStateOptions = {},
): ProfileFormState {
    const { syncWithInitial = false } = options;
    const [profile, setProfile] = useState<Profile>(initialProfile);
    const [useAuth, setUseAuth] = useState(!!initialProfile.user?.length);
    const [validationErrors, setValidationErrors] = useState<ProfileValidationErrors>(
        emptyValidationErrors,
    );

    useEffect(() => {
        if (!syncWithInitial) {
            return;
        }

        setProfile(initialProfile);
        setUseAuth(!!initialProfile.user?.length);
        setValidationErrors(emptyValidationErrors());
    }, [initialProfile, syncWithInitial]);

    const addEndpoint = () => {
        setProfile((currentProfile) => ({
            ...currentProfile,
            endpoints: [
                ...currentProfile.endpoints,
                { host: "http://localhost", port: 2379 },
            ],
        }));
    };

    const removeEndpoint = (index: number) => {
        setProfile((currentProfile) => {
            if (currentProfile.endpoints.length <= 1) {
                return currentProfile;
            }

            const nextEndpoints = [...currentProfile.endpoints];
            nextEndpoints.splice(index, 1);

            return {
                ...currentProfile,
                endpoints: nextEndpoints,
            };
        });
    };

    const updateEndpoint = (index: number, field: "host" | "port", value: string | number) => {
        if (field === "port") {
            const portValue = typeof value === "string" ? parseInt(value, 10) : value;
            setValidationErrors((currentErrors) => ({
                ...currentErrors,
                port: validatePort(portValue),
            }));
        }

        setProfile((currentProfile) => {
            const nextEndpoints = [...currentProfile.endpoints];
            nextEndpoints[index] = {
                ...nextEndpoints[index],
                [field]: value,
            };

            return {
                ...currentProfile,
                endpoints: nextEndpoints,
            };
        });
    };

    const setProfileName = (name: string) => {
        setProfile((currentProfile) => ({
            ...currentProfile,
            name,
        }));
    };

    const setUsername = (username: string) => {
        setProfile((currentProfile) => ({
            ...currentProfile,
            user: [username, currentProfile.user?.[1] || ""],
        }));
    };

    const setPassword = (password: string) => {
        setProfile((currentProfile) => ({
            ...currentProfile,
            user: [currentProfile.user?.[0] || "", password],
        }));
    };

    const setTimeoutMs = (value: number | undefined) => {
        setValidationErrors((currentErrors) => ({
            ...currentErrors,
            timeout: validateTimeout(value),
        }));

        setProfile((currentProfile) => ({
            ...currentProfile,
            timeout_ms: value,
        }));
    };

    const setConnectTimeoutMs = (value: number | undefined) => {
        setValidationErrors((currentErrors) => ({
            ...currentErrors,
            connectTimeout: validateTimeout(value),
        }));

        setProfile((currentProfile) => ({
            ...currentProfile,
            connect_timeout_ms: value,
        }));
    };

    const setMetricsPath = (value: string) => {
        const normalizedValue = value !== "" && !value.startsWith("/")
            ? `/${value}`
            : value;

        setProfile((currentProfile) => ({
            ...currentProfile,
            metrics_path: normalizedValue,
        }));
    };

    const buildProfile = () => ({
        ...profile,
        user: useAuth ? profile.user : undefined,
    });

    return {
        profile,
        useAuth,
        validationErrors,
        hasValidationErrors: Object.values(validationErrors).some(Boolean),
        addEndpoint,
        removeEndpoint,
        updateEndpoint,
        setProfileName,
        setUsername,
        setPassword,
        setTimeoutMs,
        setConnectTimeoutMs,
        setMetricsPath,
        setUseAuth,
        buildProfile,
    };
}

interface ProfileConnectionFieldsProps {
    state: ProfileFormState;
    showProfileNameHelperText?: boolean;
}

export function ProfileConnectionFields({
    state,
    showProfileNameHelperText = false,
}: ProfileConnectionFieldsProps) {
    return (
        <VStack gap={4} align="stretch">
            <Field.Root>
                <Field.Label>Profile Name</Field.Label>
                <Input
                    {...codeInputProps}
                    value={state.profile.name}
                    onChange={(event) => state.setProfileName(event.target.value)}
                    placeholder="Enter profile name"
                />
                {showProfileNameHelperText && (
                    <Field.HelperText>
                        Choose a name to identify this connection profile
                    </Field.HelperText>
                )}
            </Field.Root>

            <Box>
                <Text fontWeight="medium" mb={2}>Connection Endpoints</Text>
                <VStack gap={3} align="stretch" mb={3}>
                    {state.profile.endpoints.map((endpoint, index) => (
                        <Flex key={index} gap={2}>
                            <Input
                                {...codeInputProps}
                                flex={3}
                                value={endpoint.host}
                                onChange={(event) => state.updateEndpoint(index, "host", event.target.value)}
                                placeholder="Host (e.g. http://localhost)"
                            />
                            <Field.Root invalid={!!state.validationErrors.port} flex={1}>
                                <Input
                                    {...codeInputProps}
                                    value={endpoint.port}
                                    onChange={(event) => {
                                        const value = parseInt(event.target.value, 10);
                                        if (!Number.isNaN(value)) {
                                            state.updateEndpoint(index, "port", value);
                                        }
                                    }}
                                    placeholder="Port"
                                />
                                {state.validationErrors.port && (
                                    <Field.ErrorText>{state.validationErrors.port}</Field.ErrorText>
                                )}
                            </Field.Root>
                            <Tooltip content="Remove endpoint" showArrow>
                                <IconButton
                                    aria-label="Remove endpoint"
                                    colorPalette="red"
                                    variant="ghost"
                                    onClick={() => state.removeEndpoint(index)}
                                    disabled={state.profile.endpoints.length <= 1}
                                >
                                    <LuTrash2 />
                                </IconButton>
                            </Tooltip>
                        </Flex>
                    ))}
                </VStack>
                <Button size="sm" variant="outline" onClick={state.addEndpoint}>
                    <Box mr={2}><LuPlus /></Box>
                    Add Endpoint
                </Button>
            </Box>

            <Box pt={2}>
                <Flex align="center" justify="space-between" width="100%">
                    <Text fontWeight="medium">Authentication</Text>
                    <Switch.Root
                        checked={state.useAuth}
                        onCheckedChange={(details) => state.setUseAuth(details.checked)}
                    >
                        <Switch.HiddenInput />
                        <Switch.Control />
                        <Switch.Label ml={2}>{state.useAuth ? "Enabled" : "Disabled"}</Switch.Label>
                    </Switch.Root>
                </Flex>

                {state.useAuth && (
                    <VStack gap={4} align="stretch" width="100%" mt={3}>
                        <Field.Root>
                            <Field.Label>Username</Field.Label>
                            <Input
                                {...codeInputProps}
                                value={state.profile.user?.[0] || ""}
                                onChange={(event) => state.setUsername(event.target.value)}
                                placeholder="Username"
                            />
                        </Field.Root>
                        <Field.Root>
                            <Field.Label>Password</Field.Label>
                            <PasswordInput
                                value={state.profile.user?.[1] || ""}
                                onChange={(event) => state.setPassword(event.target.value)}
                                placeholder="Password"
                            />
                        </Field.Root>
                    </VStack>
                )}
            </Box>
        </VStack>
    );
}

interface ProfileAdvancedFieldsProps {
    state: ProfileFormState;
    showHelperText?: boolean;
    locked?: boolean;
    onLockedChange?: (locked: boolean) => void;
}

export function ProfileAdvancedFields({
    state,
    showHelperText = false,
    locked,
    onLockedChange,
}: ProfileAdvancedFieldsProps) {
    return (
        <VStack gap={4} align="stretch">
            <Field.Root invalid={!!state.validationErrors.timeout}>
                <Field.Label>Timeout (ms)</Field.Label>
                <Input
                    {...codeInputProps}
                    value={state.profile.timeout_ms === undefined ? "" : state.profile.timeout_ms}
                    onChange={(event) => {
                        const value = event.target.value === "" ? undefined : parseInt(event.target.value, 10);
                        if (value === undefined || !Number.isNaN(value)) {
                            state.setTimeoutMs(value);
                        }
                    }}
                    placeholder="Timeout in milliseconds"
                />
                {showHelperText && (
                    <Field.HelperText>
                        Request timeout in milliseconds (default: 5000)
                    </Field.HelperText>
                )}
                {state.validationErrors.timeout && (
                    <Field.ErrorText>{state.validationErrors.timeout}</Field.ErrorText>
                )}
            </Field.Root>

            <Field.Root invalid={!!state.validationErrors.connectTimeout}>
                <Field.Label>Connection Timeout (ms)</Field.Label>
                <Input
                    {...codeInputProps}
                    value={state.profile.connect_timeout_ms === undefined ? "" : state.profile.connect_timeout_ms}
                    onChange={(event) => {
                        const value = event.target.value === "" ? undefined : parseInt(event.target.value, 10);
                        if (value === undefined || !Number.isNaN(value)) {
                            state.setConnectTimeoutMs(value);
                        }
                    }}
                    placeholder="Connection timeout in milliseconds"
                />
                {showHelperText && (
                    <Field.HelperText>
                        Connection timeout in milliseconds (default: 3000)
                    </Field.HelperText>
                )}
                {state.validationErrors.connectTimeout && (
                    <Field.ErrorText>{state.validationErrors.connectTimeout}</Field.ErrorText>
                )}
            </Field.Root>

            <Field.Root>
                <Field.Label>Metrics Path</Field.Label>
                <Input
                    {...codeInputProps}
                    value={state.profile.metrics_path === undefined ? "" : state.profile.metrics_path}
                    onChange={(event) => state.setMetricsPath(event.target.value)}
                    placeholder="/metrics"
                />
                {showHelperText && (
                    <Field.HelperText>
                        Path to fetch Prometheus format metrics from (default: /metrics)
                    </Field.HelperText>
                )}
            </Field.Root>

            {typeof locked === "boolean" && onLockedChange && (
                <Flex align="center" justify="space-between">
                    <Box>
                        <Text fontWeight="medium">Read-only Mode</Text>
                        <Text fontSize="sm" color="gray.500" mt={1}>
                            When enabled, this profile cannot be used to modify server data
                        </Text>
                    </Box>
                    <Switch.Root size="lg" checked={locked} onCheckedChange={(details) => onLockedChange(details.checked)}>
                        <Switch.HiddenInput />
                        <Switch.Control>
                            <Switch.Thumb>
                                <Switch.ThumbIndicator fallback={<LuLockOpen color="black" />}>
                                    <LuLock />
                                </Switch.ThumbIndicator>
                            </Switch.Thumb>
                        </Switch.Control>
                    </Switch.Root>
                </Flex>
            )}
        </VStack>
    );
}