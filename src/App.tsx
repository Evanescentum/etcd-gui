import { useState, useEffect, useRef } from "react";
import {
  Tabs,
  EmptyState,
  Button,
  VStack,
  Center,
  Text,
  Spinner
} from "@chakra-ui/react";
import Profiles from "./components/Profiles";
import Settings from "./components/Settings";
import Onboarding from "./components/Onboarding";
import { LuLayoutDashboard, LuUsers, LuSettings, LuRefreshCw, LuTriangleAlert, LuNetwork } from "react-icons/lu";
import { initializeEtcdClient, configFileExists, getConfig, updateConfig } from "./api/etcd";
import type { AppConfig } from "./api/etcd";
import { Toaster, toaster } from "./components/ui/toaster";
import { useColorMode } from "./components/ui/color-mode";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy } from "react";


const Dashboard = lazy(() => import("./components/Dashboard"));
const Cluster = lazy(() => import("./components/Cluster"));
const currentWindow = getCurrentWindow();

function App() {
  // Color mode
  const { setColorMode } = useColorMode();

  // Add state for active tab
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Keep only the tab change check ref
  const checkBeforeTabChangeRef = useRef<(newTab: string) => Promise<boolean>>(null);

  // Add centralized config state
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const configError = useRef<string | null>(null);

  // Load config function that can be used by components to trigger a refresh
  const loadConfig = async () => {
    try {
      setConfigLoading(true);
      configError.current = null;
      const config = await getConfig();
      setAppConfig(config);
    } catch (error) {
      console.error("Failed to load config:", error);
      configError.current = error as string;
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (!appConfig || appConfig.color_theme !== "System") return;
    currentWindow.onThemeChanged(({ payload: theme }) => {
      if (theme) {
        setColorMode(theme);
      }
    });
  }, [appConfig]);

  // Update config function that can be used by components
  const saveConfig = async (newConfig: AppConfig) => {
    try {
      setConfigLoading(true);
      await updateConfig(newConfig);
      setAppConfig(newConfig);
    } catch (error) {
      console.error("Failed to update config:", error);
      toaster.create({
        title: "Configuration Error",
        description: "Failed to save application configuration",
        type: "error",
        closable: true,
      });
      throw error;
    } finally {
      setConfigLoading(false);
    }
  };

  // Initialize app and load config when component mounts
  useEffect(() => {
    const initialize = async () => {
      try {
        // Check if config file exists
        const hasConfig = await configFileExists();

        // If config doesn't exist, show onboarding
        if (!hasConfig) {
          setShowOnboarding(true);
          return;
        }

        await loadConfig();

        const result = await initializeEtcdClient();

        // If result is empty string, switch to profiles tab
        if (!result) {
          setActiveTab("profiles");
          toaster.create({
            title: "No active profile",
            description: "Please configure a connection profile to get started.",
            type: "info",
            closable: true,
          });
        }
      } catch (error) {
        console.error("Failed to initialize etcd client:", error);
        toaster.create({
          title: "Connection Error",
          description: error as string,
          type: "error",
          closable: true,
        });
      }
    };

    initialize();
  }, []);

  const handleTabChange = async (e: { value: string }) => {
    const newTab = e.value;

    // If we're leaving settings tab, check with Settings component first
    if (activeTab === "settings" && newTab !== "settings" && checkBeforeTabChangeRef.current) {
      const canProceed = await checkBeforeTabChangeRef.current(newTab);
      if (!canProceed) {
        // User cancelled the tab change
        return;
      }
    }

    // If no issues or user confirmed, change tab normally
    setActiveTab(newTab);
  };

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);

    try {
      // Load the newly created config
      await loadConfig();

      // Initialize client with the newly created profile
      const result = await initializeEtcdClient();

      if (result) {
        setActiveTab("dashboard");
        toaster.create({
          title: "Ready to go!",
          description: "Your connection profile has been created and connected successfully.",
          type: "success",
          closable: true,
        });
      }
    } catch (error) {
      console.error("Failed to initialize after onboarding:", error);
      toaster.create({
        title: "Connection Error",
        description: "Profile created but couldn't connect. Please check your settings.",
        type: "warning",
        closable: true,
      });
      setActiveTab("profiles");
    }
  };

  // If showing onboarding, render the Onboarding component
  if (showOnboarding) {
    return (
      <>
        <Onboarding onComplete={handleOnboardingComplete} />
        <Toaster />
      </>
    );
  }

  // If appConfig is null, render the EmptyState component
  if (!appConfig) {
    if (configLoading) {
      // Just return a spinner
      return (
        <Center h="100vh">
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <Spinner size="lg" borderWidth="3px" />
              </EmptyState.Indicator>
            </EmptyState.Content>
          </EmptyState.Root>
        </Center>
      )
    }

    return (
      <Center h="100vh">
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuTriangleAlert color="red" />
            </EmptyState.Indicator>
            <VStack textAlign="center" gap={3}>
              <EmptyState.Title>
                Configuration Error
              </EmptyState.Title>
              <EmptyState.Description>
                Failed to load configuration:
                <Text color="red.500" fontWeight="medium" mt={2}>
                  {configError.current}
                </Text>
              </EmptyState.Description>
              <Button
                onClick={loadConfig}
                mt={4}
                loading={configLoading}
              >
                <LuRefreshCw style={{ marginRight: '0.5rem' }} />
                Retry
              </Button>
            </VStack>
          </EmptyState.Content>
        </EmptyState.Root>
        <Toaster />
      </Center>
    );
  }

  return (
    <>
      {/* Left sidebar */}
      <Tabs.Root
        variant={"enclosed"}
        value={activeTab}
        onValueChange={handleTabChange}
        orientation="vertical"
        width="100vw"
        height="100vh"
        display="flex"
      >
        <Tabs.List
          borderRightWidth="thin"
          borderColor="gray.subtle"
          width="15rem"
          borderRadius="none"
        >
          <Tabs.Trigger
            value="dashboard"
            justifyContent="flex-start"
          >
            <LuLayoutDashboard /> Dashboard
          </Tabs.Trigger>
          <Tabs.Trigger
            value="cluster"
            justifyContent="flex-start"
          >
            <LuNetwork /> Cluster
          </Tabs.Trigger>
          <Tabs.Trigger
            value="profiles"
            justifyContent="flex-start"
          >
            <LuUsers /> Profiles
          </Tabs.Trigger>
          <Tabs.Trigger
            value="settings"
            justifyContent="flex-start"
          >
            <LuSettings /> Settings
          </Tabs.Trigger>
        </Tabs.List>

        {/* Content area */}
        <Tabs.Content value="dashboard" paddingX={2} width="100%" height="100%">
          <Dashboard
            configLoading={configLoading}
            appConfig={appConfig}
          />
        </Tabs.Content>
        <Tabs.Content value="cluster" paddingX={2} width="100%" height="100%">
          <Cluster
            configLoading={configLoading}
            appConfig={appConfig}
          />
        </Tabs.Content>
        <Tabs.Content value="profiles" paddingX={2} width="100%" height="100%">
          <Profiles
            config={appConfig}
            configLoading={configLoading}
            saveConfig={saveConfig}
          />
        </Tabs.Content>
        <Tabs.Content value="settings" paddingX={2} width="100%" height="100%">
          <Settings
            onBeforeTabChange={checkBeforeTabChangeRef}
            config={appConfig}
            saveConfig={saveConfig}
          />
        </Tabs.Content>
      </Tabs.Root>

      <Toaster />
    </>
  );
}

export default App;
