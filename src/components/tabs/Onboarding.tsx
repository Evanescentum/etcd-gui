import { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
  Flex,
  Separator,
  Steps,
  useSteps,
} from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { LuArrowRight, LuChevronLeft, LuChevronsRight, LuRefreshCw, LuCheck, LuCircleAlert } from "react-icons/lu";
import { getDefaultConfig, updateConfig, testConnection } from "../../api/etcd";
import type { AppConfig } from "../../api/etcd";
import { toaster } from "../ui/toaster";
import { Tooltip } from "../../components/ui/tooltip";
import {
  ProfileAdvancedFields,
  ProfileConnectionFields,
  useProfileFormState,
} from "../ProfileFormFields";

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

  const profileForm = useProfileFormState({
    name: "Default",
    endpoints: [{ host: "http://localhost", port: 2379 }],
    timeout_ms: 5000,
    connect_timeout_ms: 3000,
    metrics_path: "/metrics",
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

  const handleTestConnection = async () => {
    if (profileForm.profile.endpoints.length === 0) return;

    // Clear previous test results and timer
    setConnectionTestResult(null);
    setConnectionError("");
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setTestingConnection(true);

    // Prepare profile with auth if enabled
    const profileToTest = profileForm.buildProfile();

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
      const config: AppConfig = await getDefaultConfig();

      const profile = profileForm.buildProfile();
      config.profiles = [profile];
      config.current_profile = profile.name;

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
              <ProfileConnectionFields
                state={profileForm}
                showProfileNameHelperText
              />
            </Steps.Content>

            {/* Step 2: Advanced Configuration (Timeouts only) */}
            <Steps.Content index={1}>
              <ProfileAdvancedFields state={profileForm} showHelperText />
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
                  disabled={profileForm.profile.endpoints.length === 0 || profileForm.hasValidationErrors}
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
                  <Button colorPalette="blue">
                    Next
                    <Box ml={2}><LuArrowRight /></Box>
                  </Button>
                </Steps.NextTrigger>
              ) : (
                <Button
                  colorPalette="blue"
                  onClick={handleFinish}
                  loadingText="Setting Up"
                  disabled={!profileForm.profile.name.trim() || profileForm.profile.endpoints.length === 0 || profileForm.hasValidationErrors}
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
