import { Activity, useState, useEffect, useRef, lazy, useCallback, useMemo } from "react";
import {
  Tabs,
  EmptyState,
  Center,
  Spinner
} from "@chakra-ui/react";
import { LuLayoutDashboard, LuUsers, LuSettings, LuNetwork, LuFileText, LuActivity } from "react-icons/lu";
import { checkUpdate, initializeClient, configFileExists, getConfig, listenAutoUpdateCheckEvents, updateConfig } from "./api/etcd";
import type { AppConfig, Profile, UpdateChannel, UpdateCheckResult } from "./api/etcd";
import { Toaster, toaster } from "./components/ui/toaster";
import { useTheme } from "next-themes";
import UpdateCheckDialog from "./components/dialogs/UpdateCheckDialog";
import { ActiveProfileProvider } from "./contexts/active-profile";
import { Provider } from "./components/ui/provider";

export type GuardedAppState =
  | { kind: "onboarding" }
  | { kind: "profile-required"; appConfig: AppConfig }
  | { kind: "ready"; appConfig: AppConfig; activeProfile: Profile };

export function resolveAppGuardState(appConfig: AppConfig | null): GuardedAppState {
  if (!appConfig) {
    return { kind: "onboarding" };
  }

  if (appConfig.profiles.length === 0) {
    return { kind: "profile-required", appConfig };
  }

  const activeProfile = appConfig.profiles.find((profile) => profile.name === appConfig.current_profile) ?? null;
  if (!activeProfile) {
    return { kind: "profile-required", appConfig };
  }

  return {
    kind: "ready",
    appConfig,
    activeProfile,
  };
}

const Dashboard = lazy(() => import("./components/tabs/Dashboard"));
const Cluster = lazy(() => import("./components/tabs/Cluster"));
const Logs = lazy(() => import("./components/tabs/Logs"));
const Metrics = lazy(() => import("./components/tabs/Metrics"));
const Onboarding = lazy(() => import("./components/tabs/Onboarding"));
const Profiles = lazy(() => import("./components/tabs/Profiles"));
const Settings = lazy(() => import("./components/tabs/Settings"));

interface ThemeSyncProps {
  appConfig: AppConfig | null;
}

function ThemeSync({ appConfig }: ThemeSyncProps) {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!appConfig) {
      return;
    }

    if (appConfig.color_theme === "System") {
      setTheme("system");
      return;
    }

    setTheme(appConfig.color_theme.toLowerCase());
  }, [appConfig, setTheme]);

  return null;
}

function App() {
  // Add state for active tab
  const [activeTab, setActiveTab] = useState("dashboard");

  // Keep only the tab change check ref
  const checkBeforeTabChangeRef = useRef<(newTab: string) => Promise<boolean>>(null);

  // Add centralized config state
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<AppConfig | null>(null); // Keep track of last saved config to enable discarding
  const [configLoading, setConfigLoading] = useState(true);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);

  // Load config from disk
  const loadConfig = async () => {
    try {
      setConfigLoading(true);
      const config = await getConfig();
      setAppConfig(config);
      setSavedConfig(config);
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setConfigLoading(false);
    }
  };

  const guardedState = useMemo(() => resolveAppGuardState(appConfig), [appConfig]);
  useEffect(() => {
    if (guardedState.kind === "profile-required" && activeTab !== "profiles") {
      setActiveTab("profiles");
    }
  }, [activeTab, guardedState.kind]);

  // Update config function that can be used by components
  const saveConfig = async (newConfig: AppConfig) => {
    try {
      setConfigLoading(true);
      await updateConfig(newConfig);
      setAppConfig(newConfig);
      setSavedConfig(newConfig);
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
        // If config doesn't exist, onboarding screen will be shown
        if (!await configFileExists()) {
          setConfigLoading(false);
          return;
        }

        await loadConfig();

        const result = await initializeClient();

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

  // Listen for app update check events
  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenAutoUpdateCheckEvents((payload) => {
      if (payload.error) {
        toaster.create({
          title: "Failed to check for updates",
          description: payload.error,
          type: "error",
          closable: true,
        });
        return;
      }

      if (!payload.result) {
        return;
      }

      if (payload.result.update_available) {
        setUpdateResult(payload.result);
      }
    })
      .then((dispose) => {
        if (isDisposed) {
          dispose();
          return;
        }

        unlisten = dispose;
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        toaster.create({
          title: "Update event listener error",
          description: msg,
          type: "error",
          closable: true,
        });
      });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  const handleManualCheckUpdate = useCallback(async (channel: UpdateChannel) => {
    if (updateChecking) {
      return;
    }

    setUpdateChecking(true);

    try {
      const result = await checkUpdate(channel);
      setUpdateResult(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toaster.create({
        title: "Failed to check for updates",
        description: msg,
        type: "error",
        closable: true,
      });
    } finally {
      setUpdateChecking(false);
    }
  }, [updateChecking]);

  const handleTabChange = async (e: { value: string }) => {
    const newTab = e.value;

    if (guardedState.kind === "profile-required" && newTab !== "profiles") {
      toaster.create({
        title: "Profile Required",
        description: "Create or activate a valid profile before leaving the Profiles page.",
        type: "info",
        closable: true,
      });
      return;
    }

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
    try {
      // Load the newly created config
      await loadConfig();

      // Initialize client with the newly created profile
      const result = await initializeClient();

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

  const providerProps = {
    visualTheme: appConfig?.visual_theme,
    fontFamilyBody: appConfig?.font_family_body,
    fontFamilyMono: appConfig?.font_family_mono,
  };

  if (configLoading && !appConfig) {
    return (
      <Provider {...providerProps}>
        <Center h="100vh">
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <Spinner size="lg" borderWidth="3px" />
              </EmptyState.Indicator>
            </EmptyState.Content>
          </EmptyState.Root>
        </Center>
        <Toaster />
      </Provider>
    );
  }

  if (guardedState.kind === "onboarding") {
    return (
      <Provider {...providerProps}>
        <ThemeSync appConfig={appConfig} />
        <Onboarding onComplete={handleOnboardingComplete} />
        <Toaster />
      </Provider>
    );
  }

  const appShell = (
    <Tabs.Root
      variant={"enclosed"}
      value={activeTab}
      onValueChange={handleTabChange}
      orientation="vertical"
      lazyMount
      width="100vw"
      height="100vh"
      display="flex"
    >
      <Tabs.List
        width="14rem"
      >
        <Tabs.Trigger
          value="dashboard"
          justifyContent="flex-start"
          disabled={guardedState.kind === "profile-required"}
          mt="5"
        >
          <LuLayoutDashboard /> Dashboard
        </Tabs.Trigger>
        <Tabs.Trigger
          value="cluster"
          justifyContent="flex-start"
          disabled={guardedState.kind === "profile-required"}
        >
          <LuNetwork /> Cluster
        </Tabs.Trigger>
        <Tabs.Trigger
          value="metrics"
          justifyContent="flex-start"
          disabled={guardedState.kind === "profile-required"}
        >
          <LuActivity /> Metrics
        </Tabs.Trigger>
        <Tabs.Trigger
          value="profiles"
          justifyContent="flex-start"
        >
          <LuUsers /> Profiles
        </Tabs.Trigger>
        <Tabs.Trigger
          value="logs"
          justifyContent="flex-start"
          disabled={guardedState.kind === "profile-required"}
        >
          <LuFileText /> Logs
        </Tabs.Trigger>
        <Tabs.Trigger
          value="settings"
          justifyContent="flex-start"
          disabled={guardedState.kind === "profile-required"}
        >
          <LuSettings /> Settings
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="dashboard" paddingX={3} width="100%" height="100%">
        {guardedState.kind === "ready" && (
          <Activity mode={activeTab === "dashboard" ? "visible" : "hidden"}>
            <Dashboard
              configLoading={configLoading}
            />
          </Activity>
        )}
      </Tabs.Content>
      <Tabs.Content value="cluster" paddingX={3} width="100%" height="100%">
        {guardedState.kind === "ready" && (
          <Activity mode={activeTab === "cluster" ? "visible" : "hidden"}>
            <Cluster
              configLoading={configLoading}
            />
          </Activity>
        )}
      </Tabs.Content>
      <Tabs.Content value="metrics" paddingX={3} width="100%" height="100%">
        {guardedState.kind === "ready" && (
          <Activity mode={activeTab === "metrics" ? "visible" : "hidden"}>
            <Metrics
              configLoading={configLoading}
              isActive={activeTab === "metrics"}
            />
          </Activity>
        )}
      </Tabs.Content>
      <Tabs.Content value="profiles" paddingX={3} width="100%" height="100%">
        <Activity mode={activeTab === "profiles" ? "visible" : "hidden"}>
          <Profiles
            config={guardedState.appConfig}
            saveConfig={saveConfig}
          />
        </Activity>
      </Tabs.Content>
      <Tabs.Content value="logs" paddingX={3} width="100%" height="100%">
        {guardedState.kind === "ready" && (
          <Activity mode={activeTab === "logs" ? "visible" : "hidden"}>
            <Logs />
          </Activity>
        )}
      </Tabs.Content>
      <Tabs.Content value="settings" paddingX={3} width="100%" height="100%">
        {guardedState.kind === "ready" && (
          <Activity mode={activeTab === "settings" ? "visible" : "hidden"}>
            <Settings
              onBeforeTabChange={checkBeforeTabChangeRef}
              config={savedConfig || guardedState.appConfig}
              saveConfig={saveConfig}
              updateChecking={updateChecking}
              onCheckUpdate={handleManualCheckUpdate}
              onConfigChange={(newConfig: AppConfig) => { setAppConfig(newConfig) }}
              onDiscard={() => { if (savedConfig) setAppConfig(savedConfig) }}
            />
          </Activity>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );

  return (
    <Provider {...providerProps}>
      <ThemeSync appConfig={guardedState.appConfig} />
      {guardedState.kind === "ready" ? (
        <ActiveProfileProvider
          appConfig={guardedState.appConfig}
          activeProfile={guardedState.activeProfile}
        >
          {appShell}
        </ActiveProfileProvider>
      ) : // Just return a spinner
        <Center h="100vh">
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <Spinner size="lg" borderWidth="3px" />
              </EmptyState.Indicator>
            </EmptyState.Content>
          </EmptyState.Root>
        </Center>
      }

      {updateResult !== null && (
        <UpdateCheckDialog
          onClose={() => setUpdateResult(null)}
          result={updateResult}
        />
      )}

      <Toaster />
    </Provider>
  );
}

export default App;
