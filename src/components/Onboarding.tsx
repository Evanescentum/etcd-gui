import { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  Input,
  Field,
  IconButton,
  Switch,
  Separator,
  Steps,
  useSteps,
} from "@chakra-ui/react";
import { useColorModeValue } from "../components/ui/color-mode";
import { LuPlus, LuTrash2, LuArrowRight, LuChevronLeft, LuChevronsRight, LuRefreshCw, LuCheck, LuCircleAlert } from "react-icons/lu";
import { updateConfig, testConnection } from "../api/etcd";
import type { AppConfig, Profile } from "../api/etcd";
import { toaster } from "./ui/toaster";
import { Tooltip } from "../components/ui/tooltip";

interface OnboardingProps {
  onComplete: () => void;
}

function Onboarding({ onComplete }: OnboardingProps) {
  const [testingConnection, setTestingConnection] = useState(false);

  const steps = useSteps({ defaultStep: 0 });

  // Connection test result states
  const [connectionTestResult, setConnectionTestResult] = useState<"success" | "error" | null>(null);
  const [connectionVersion, setConnectionVersion] = useState<string>("");
  // Error message state for connection test
  const [connectionError, setConnectionError] = useState<string>("");

  // Create a default profile template
  const [profile, setProfile] = useState<Profile>({
    name: "Default",
    endpoints: [{ host: "http://localhost", port: 2379 }],
    timeout_ms: 5000,
    connect_timeout_ms: 3000,
  });
  const [useAuth, setUseAuth] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    port: '',
    timeout: '',
    connectTimeout: ''
  });

  // Timer reference to reset test result states
  const resetTimerRef = useRef<number | null>(null);

  // Clear timer when component unmounts
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

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

  const removeEndpoint = (index: number) => {
    if (profile.endpoints.length <= 1) return;

    const newEndpoints = [...profile.endpoints];
    newEndpoints.splice(index, 1);

    setProfile({
      ...profile,
      endpoints: newEndpoints
    });
  };

  const updateEndpoint = (index: number, field: 'host' | 'port', value: string | number) => {
    const newEndpoints = [...profile.endpoints];

    if (field === 'port') {
      const portValue = typeof value === 'string' ? parseInt(value, 10) : value;
      const error = validatePort(portValue);
      setValidationErrors(prev => ({ ...prev, port: error }));
    }

    newEndpoints[index] = {
      ...newEndpoints[index],
      [field]: value
    };

    setProfile({
      ...profile,
      endpoints: newEndpoints
    });
  };

  const handleTestConnection = async () => {
    if (profile.endpoints.length === 0) return;

    // Clear previous test results and timer
    setConnectionTestResult(null);
    setConnectionError("");
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setTestingConnection(true);

    // Prepare profile with auth if enabled
    const profileToTest = {
      ...profile,
      user: useAuth ? profile.user : undefined
    };

    try {
      const version = await testConnection(profileToTest);

      // Set success status and version info
      setConnectionVersion(version);
      setConnectionTestResult("success");

      // Reset status after 3 seconds
      resetTimerRef.current = window.setTimeout(() => {
        setConnectionTestResult(null);
        resetTimerRef.current = null;
      }, 3000);
    } catch (error) {
      // Set error status and message
      setConnectionTestResult("error");
      setConnectionError(typeof error === "string" ? error : "Failed to connect to etcd server.");

      // Also set auto-reset timer for error state
      resetTimerRef.current = window.setTimeout(() => {
        setConnectionTestResult(null); // Reset button state
        setConnectionError(""); // Also clear error message to prevent tooltip on hover
        resetTimerRef.current = null;
      }, 3000);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFinish = async () => {
    try {
      // Create config object
      const config: AppConfig = {
        profiles: [profile],
        current_profile: profile.name,
        color_theme: 'System'
      };

      // Handle auth
      if (useAuth) {
        config.profiles[0].user = [profile.user?.[0] || '', profile.user?.[1] || ''];
      } else {
        delete config.profiles[0].user;
      }

      // Save config
      await updateConfig(config);

      // Notify parent component
      onComplete();
    } catch (error) {
      toaster.create({
        title: "Failed to save config",
        description: error as string,
        type: "error",
        closable: true,
      });
    }
  };

  return (
    <Box minH="100vh" py={10} bg={useColorModeValue("gray.50", "gray.900")}>
      <Container maxW="800px">
        <Box p={8} shadow="lg" borderRadius="xl" borderWidth="thin">
          {/* Header */}
          <VStack gap={6} mb={8}>
            <Heading size="xl">Welcome to ETCD GUI</Heading>
            <Text textAlign="center" fontSize="lg" color="gray.solid">
              Let's set up your first connection profile to get started
            </Text>
          </VStack>

          {/* Steps component */}
          <Steps.RootProvider value={steps}>
            <Steps.List mb={8}>
              <Steps.Item index={0}>
                <Steps.Trigger>
                  <Steps.Indicator />
                  <Steps.Title>Connection</Steps.Title>
                </Steps.Trigger>
                <Steps.Separator />
              </Steps.Item>
              <Steps.Item index={1}>
                <Steps.Trigger>
                  <Steps.Indicator />
                  <Steps.Title>Advanced</Steps.Title>
                </Steps.Trigger>
                <Steps.Separator />
              </Steps.Item>
            </Steps.List>

            <Separator mb={6} />

            {/* Step 1: Basic Configuration with Authentication */}
            <Steps.Content index={0}>
              <VStack gap={6} align="start">
                <Field.Root>
                  <Field.Label>Profile Name</Field.Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="Enter profile name"
                  />
                  <Field.HelperText>
                    Choose a name to identify this connection profile
                  </Field.HelperText>
                </Field.Root>

                <Box width="100%">
                  <Text fontWeight="medium" mb={2}>Connection Endpoints</Text>
                  <VStack gap={3} align="stretch" mb={3}>
                    {profile.endpoints.map((endpoint, index) => (
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

                        <IconButton
                          aria-label="Remove endpoint"
                          children={<LuTrash2 />}
                          colorScheme="red"
                          variant="ghost"
                          onClick={() => removeEndpoint(index)}
                          disabled={profile.endpoints.length <= 1}
                        />
                      </Flex>
                    ))}
                  </VStack>
                  <Button
                    size="sm"
                    onClick={() => {
                      setProfile({
                        ...profile,
                        endpoints: [
                          ...profile.endpoints,
                          { host: "http://localhost", port: 2379 }
                        ]
                      });
                    }}
                    mt={2}
                  >
                    <Box mr={2}><LuPlus /></Box>
                    Add Endpoint
                  </Button>
                </Box>
                <Box width="100%" pt={2}>
                  <Flex align="center" justify="space-between" width="100%">
                    <Text fontWeight="medium">Authentication</Text>
                    <Switch.Root
                      checked={useAuth}
                      onCheckedChange={(e) => setUseAuth(e.checked)}
                    >
                      <Switch.HiddenInput />
                      <Switch.Control />
                      <Switch.Label ml={2}>{useAuth ? 'Enabled' : 'Disabled'}</Switch.Label>
                    </Switch.Root>
                  </Flex>

                  {useAuth && (
                    <VStack gap={4} align="stretch" width="100%" mt={3}>
                      <Field.Root>
                        <Field.Label>Username</Field.Label>
                        <Input
                          value={profile.user?.[0] || ""}
                          onChange={(e) => setProfile({
                            ...profile,
                            user: [e.target.value, profile.user?.[1] || ""]
                          })}
                          placeholder="Username"
                        />
                      </Field.Root>
                      <Field.Root>
                        <Field.Label>Password</Field.Label>
                        <Input
                          type="password"
                          value={profile.user?.[1] || ""}
                          onChange={(e) => setProfile({
                            ...profile,
                            user: [profile.user?.[0] || "", e.target.value]
                          })}
                          placeholder="Password"
                        />
                      </Field.Root>
                    </VStack>
                  )}
                </Box>
              </VStack>
            </Steps.Content>

            {/* Step 2: Advanced Configuration (Timeouts only) */}
            <Steps.Content index={1}>
              <VStack gap={6} align="start">
                <Field.Root invalid={!!validationErrors.timeout}>
                  <Field.Label>Timeout (ms)</Field.Label>
                  <Input
                    value={profile.timeout_ms === undefined ? '' : profile.timeout_ms}
                    onChange={(e) => {
                      const value = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                      if (value === undefined || !isNaN(value)) {
                        const error = validateTimeout(value);
                        setValidationErrors(prev => ({ ...prev, timeout: error }));
                        setProfile({ ...profile, timeout_ms: value });
                      }
                    }}
                    placeholder="Timeout in milliseconds"
                  />
                  <Field.HelperText>
                    Request timeout in milliseconds (default: 5000)
                  </Field.HelperText>
                  {validationErrors.timeout && (
                    <Field.ErrorText>{validationErrors.timeout}</Field.ErrorText>
                  )}
                </Field.Root>

                <Field.Root invalid={!!validationErrors.connectTimeout}>
                  <Field.Label>Connection Timeout (ms)</Field.Label>
                  <Input
                    value={profile.connect_timeout_ms === undefined ? '' : profile.connect_timeout_ms}
                    onChange={(e) => {
                      const value = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                      if (value === undefined || !isNaN(value)) {
                        const error = validateTimeout(value);
                        setValidationErrors(prev => ({ ...prev, connectTimeout: error }));
                        setProfile({ ...profile, connect_timeout_ms: value });
                      }
                    }}
                    placeholder="Connection timeout in milliseconds"
                  />
                  <Field.HelperText>
                    Connection timeout in milliseconds (default: 3000)
                  </Field.HelperText>
                  {validationErrors.connectTimeout && (
                    <Field.ErrorText>{validationErrors.connectTimeout}</Field.ErrorText>
                  )}
                </Field.Root>
              </VStack>
            </Steps.Content>

            <Separator mt={8} mb={6} />

            {/* Custom footer with test connection button and navigation controls */}
            <Flex justify="space-between" align="center">

              <Steps.PrevTrigger asChild>
                <Button variant="outline" visibility={steps.hasPrevStep ? "visible" : "hidden"}>
                  <Box mr={2}><LuChevronLeft /></Box>
                  Back
                </Button>
              </Steps.PrevTrigger>


              <Tooltip
                content={connectionError}
                showArrow
                open={connectionTestResult === "error" ? true : false}
                disabled={connectionTestResult !== "error"}
              >
                <Button
                  variant={connectionTestResult ? "solid" : "outline"}
                  colorPalette={connectionTestResult === "success" ? "green" : connectionTestResult === "error" ? "red" : "gray"}
                  onClick={handleTestConnection}
                  loading={testingConnection}
                  loadingText="Testing"
                  disabled={profile.endpoints.length === 0 || !!validationErrors.port}
                >
                  <Box mr={2}>
                    {(() => {
                      if (testingConnection) return <LuRefreshCw />;
                      if (connectionTestResult === "success") return <LuCheck />;
                      if (connectionTestResult === "error") return <LuCircleAlert />;
                      return <LuRefreshCw />;
                    })()}
                  </Box>
                  {(() => {
                    if (testingConnection) return "Testing...";
                    if (connectionTestResult === "success") return `Connected to etcd v${connectionVersion}`;
                    if (connectionTestResult === "error") return "Connection Failed";
                    return "Test Connection";
                  })()}
                </Button>
              </Tooltip>

              {steps.hasNextStep ? (
                <Steps.NextTrigger asChild>
                  <Button colorScheme="blue">
                    Next
                    <Box ml={2}><LuArrowRight /></Box>
                  </Button>
                </Steps.NextTrigger>
              ) : (
                <Button
                  colorScheme="blue"
                  onClick={handleFinish}
                  loadingText="Setting Up"
                >
                  Finish Setup
                  <Box ml={2}><LuChevronsRight /></Box>
                </Button>
              )}
            </Flex>
          </Steps.RootProvider>
        </Box>
      </Container>
    </Box>
  );
}

export default Onboarding;
