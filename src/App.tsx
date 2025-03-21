import { useState, useEffect, useRef } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { Tabs } from "@chakra-ui/react";
import Profiles from "./components/Profiles";
import Settings from "./components/Settings";
import Onboarding from "./components/Onboarding";
import { LuLayoutDashboard, LuUsers, LuSettings } from "react-icons/lu";
import { initializeEtcdClient, configFileExists, getConfig, updateConfig } from "./api/etcd";
import type { AppConfig } from "./api/etcd";
import { Toaster, toaster } from "./components/ui/toaster";
import { useColorModeValue, useColorMode } from "./components/ui/color-mode";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { UnlistenFn } from "@tauri-apps/api/event";
import { lazy } from "react";


const Dashboard = lazy(() => import("./components/Dashboard"));
const currentWindow = getCurrentWindow();

function App() {
  // Color mode
  const { setColorMode } = useColorMode();

  // Add state for active tab
  const [activeTab, setActiveTab] = useState("dashboard");
  const [initializing, setInitializing] = useState(true);
  const [shouldRefreshDashboard, setShouldRefreshDashboard] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Keep only the tab change check ref
  const checkBeforeTabChangeRef = useRef<(newTab: string) => Promise<boolean>>();

  // Add centralized config state
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Load config function that can be used by components to trigger a refresh
  const loadConfig = async () => {
    try {
      setConfigLoading(true);
      const config = await getConfig();
      setAppConfig(config);
      return config;
    } catch (error) {
      console.error("Failed to load config:", error);
      toaster.create({
        title: "Configuration Error",
        description: "Failed to load application configuration",
        type: "error",
        meta: { closable: true },
      });
      throw error;
    } finally {
      setConfigLoading(false);
    }
  };

  // If the theme config item is not set to a specific value, listen for system theme changes
  useEffect(() => {
    // Change the color mode now if needed
    if (!appConfig || appConfig.color_theme === "System") {
      currentWindow.theme().then((theme) => {
        if (theme) {
          setColorMode(theme);
        }
      });
    }

    let unlisten: UnlistenFn;
    currentWindow.onThemeChanged(({ payload: theme }) => {
      if (!appConfig || appConfig.color_theme !== "System") return;
      setColorMode(theme);
    }).then((l) => { unlisten = l; });

    return () => {
      unlisten?.();
    };
  }, []);

  // Update config function that can be used by components
  const saveConfig = async (newConfig: AppConfig) => {
    try {
      setConfigLoading(true);
      await updateConfig(newConfig);
      setAppConfig(newConfig);
      return newConfig;
    } catch (error) {
      console.error("Failed to update config:", error);
      toaster.create({
        title: "Configuration Error",
        description: "Failed to save application configuration",
        type: "error",
        meta: { closable: true },
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
        setInitializing(true);

        // Check if config file exists
        const hasConfig = await configFileExists();

        // If config doesn't exist, show onboarding
        if (!hasConfig) {
          setShowOnboarding(true);
          setInitializing(false);
          return;
        }

        // Load the config first
        await loadConfig();

        // Then initialize the client
        const result = await initializeEtcdClient();

        // If result is empty string, switch to profiles tab
        if (result === "") {
          setActiveTab("profiles");
          toaster.create({
            title: "No active profile",
            description: "Please configure a connection profile to get started.",
            type: "info",
            meta: { closable: true },
          });
        } else if (result) {
          toaster.create({
            title: "Connection established",
            description: result,
            type: "success",
            meta: { closable: true },
          });
        }
      } catch (error) {
        console.error("Failed to initialize etcd client:", error);
        toaster.create({
          title: "Connection Error",
          description: error as string,
          type: "error",
          meta: { closable: true },
        });
      } finally {
        setInitializing(false);
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
          meta: { closable: true },
        });
      }
    } catch (error) {
      console.error("Failed to initialize after onboarding:", error);
      toaster.create({
        title: "Connection Error",
        description: "Profile created but couldn't connect. Please check your settings.",
        type: "warning",
        meta: { closable: true },
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

  return (
    <>
      <Flex h="100vh" width="100%">
        {/* Left sidebar with vertical tabs - structured for responsive layout */}
        <Tabs.Root
          lazyMount
          variant={"enclosed"}
          value={activeTab}
          onValueChange={handleTabChange}
          orientation="vertical"
          width="100%"
          height="100vh"
          display="flex"
        >
          {/* Fixed width sidebar */}
          <Tabs.List
            borderRightWidth="1px"
            borderColor="gray.200"
            py={4}
            width="200px"
            flexShrink={0}
            borderRadius="none"
            borderRightColor={useColorModeValue("gray.300", "gray.600")}
          >
            <Tabs.Trigger
              value="dashboard"
              justifyContent="flex-start"
              px={4}
              py={3}
              gap={2}
            >
              <LuLayoutDashboard /> Dashboard
            </Tabs.Trigger>
            <Tabs.Trigger
              value="profiles"
              justifyContent="flex-start"
              px={4}
              py={3}
              gap={2}
            >
              <LuUsers /> Profiles
            </Tabs.Trigger>
            <Tabs.Trigger
              value="settings"
              justifyContent="flex-start"
              px={4}
              py={3}
              gap={2}
            >
              <LuSettings /> Settings
            </Tabs.Trigger>
          </Tabs.List>

          {/* Content area */}
          <Box flex="1" overflow="hidden" minWidth={0}>
            <Tabs.Content value="dashboard" p={0} h="100%">
              <Dashboard
                appInitializing={initializing}
                appConfig={appConfig}
                shouldRefresh={shouldRefreshDashboard}
                onRefreshComplete={() => setShouldRefreshDashboard(false)}
              />
            </Tabs.Content>
            <Tabs.Content value="profiles" p={0} h="100%">
              <Profiles
                onCurrentProfileChanged={() => {
                  setShouldRefreshDashboard(true);
                  // Reload config after profile changes
                  loadConfig();
                }}
                config={appConfig}
                configLoading={configLoading}
                onConfigUpdate={saveConfig}
              />
            </Tabs.Content>
            <Tabs.Content value="settings" p={0} h="100%">
              <Settings
                onBeforeTabChange={checkBeforeTabChangeRef}
                config={appConfig}
                onConfigUpdate={saveConfig}
              />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Flex>

      <Toaster />
    </>
  );
}

export default App;
