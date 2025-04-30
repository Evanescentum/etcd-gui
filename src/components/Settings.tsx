import { useState, useEffect, useCallback, useMemo } from "react";
import { MutableRefObject } from "react";
import {
  Box,
  Button,
  Heading,
  Text,
  VStack,
  SegmentGroup,
  Card,
  Separator,
  HStack,
  Code,
  Flex,
  IconButton,
  Dialog,
} from "@chakra-ui/react";
import { useColorMode } from "../components/ui/color-mode";
import type { AppConfig } from "../api/etcd";
import { getConfigFilePath, openConfigFile } from "../api/etcd";
import { toaster } from "./ui/toaster";
import { LuMonitor, LuSun, LuMoon, LuCopy, LuExternalLink } from "react-icons/lu";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Tooltip } from "./ui/tooltip";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const webviewWindow = getCurrentWebviewWindow();

// Define the props interface for the Settings component
interface SettingsProps {
  config: AppConfig;
  saveConfig: (config: AppConfig) => Promise<void>;
  onBeforeTabChange?: MutableRefObject<((newTab: string) => Promise<boolean>) | undefined>;
}

function Settings({
  config,
  saveConfig,
  onBeforeTabChange
}: SettingsProps) {
  const [configSaving, setConfigSaving] = useState(false);
  const [colorTheme, setColorTheme] = useState<"Light" | "Dark" | "System">("System");
  const themeInAppConfig = useMemo(() => config.color_theme, [config]);
  const [configPath, setConfigPath] = useState<string>("");
  const [configPathLoading, setConfigPathLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const { setColorMode } = useColorMode();

  // Dialog state for unsaved changes
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    pendingTabChange: string | null;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    pendingTabChange: null,
    resolve: null
  });

  // Load config file path
  useEffect(() => {
    const loadConfigPath = async () => {
      try {
        setConfigPathLoading(true);
        const path = await getConfigFilePath();
        if (path.startsWith("\\\\?\\")) {
          setConfigPath(path.substring(4));
        } else {
          setConfigPath(path);
        }
      } catch (error) {
        console.error("Failed to get config file path:", error);
      } finally {
        setConfigPathLoading(false);
      }
    };

    loadConfigPath();
  }, []);

  // Handle opening config file
  const handleOpenConfigFile = async () => {
    try {
      await openConfigFile();
    } catch (error) {
      toaster.create({
        title: "Error",
        description: "Failed to open configuration file",
        type: "error",
        meta: { closable: true },
      });
    }
  };

  async function handleCopyConfigPath() {
    await writeText(configPath);
    setHasCopied(true);
    setTimeout(() => {
      setHasCopied(false);
    }, 800);
  }

  const handleSaveTheme = async () => {
    try {
      setConfigSaving(true);

      // Update config with new theme
      const updatedConfig = {
        ...config,
        color_theme: colorTheme,
      };

      await saveConfig(updatedConfig);

      toaster.create({
        title: "Settings saved",
        description: "Your theme preference has been updated",
        type: "success",
        meta: { closable: true },
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toaster.create({
        title: "Error",
        description: "Failed to save settings",
        type: "error",
        meta: { closable: true },
      });
    } finally {
      setConfigSaving(false);
    }
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return colorTheme !== themeInAppConfig;
  }, [colorTheme, config]);

  // Expose method to check before tab change
  useEffect(() => {
    if (onBeforeTabChange) {
      onBeforeTabChange.current = async (newTab: string) => {
        // If no unsaved changes, allow tab change
        if (!hasUnsavedChanges()) {
          return true;
        }

        // If there are unsaved changes, show dialog
        return new Promise<boolean>((resolve) => {
          setDialogState({
            isOpen: true,
            pendingTabChange: newTab,
            resolve
          });
        });
      };
    }
  }, [onBeforeTabChange, hasUnsavedChanges]);

  // Handle dialog actions
  const handleSaveAndContinue = async () => {
    await handleSaveTheme();
    if (dialogState.resolve) {
      dialogState.resolve(true);
    }
    setDialogState({ isOpen: false, pendingTabChange: null, resolve: null });
  };

  const handleDiscardAndContinue = () => {
    if (themeInAppConfig) {
      setColorTheme(themeInAppConfig);
    }
    if (dialogState.resolve) {
      dialogState.resolve(true);
    }
    setDialogState({ isOpen: false, pendingTabChange: null, resolve: null });
  };

  const handleCancelTabChange = () => {
    if (dialogState.resolve) {
      dialogState.resolve(false);
    }
    setDialogState({ isOpen: false, pendingTabChange: null, resolve: null });
  };

  // When user changes config, update the color theme to match
  useEffect(() => {
    switch (colorTheme) {
      case "Light":
        setColorMode("light");
        break;
      case "Dark":
        setColorMode("dark");
        break;
      case "System":
        webviewWindow.theme().then((theme) => {
          if (!theme) return;
          setColorMode(theme);
        });
        break;
    }
  }, [colorTheme]);

  // Initialize theme from config
  useEffect(() => {
    setColorTheme(config.color_theme);
  }, [config]);

  // Theme options with icons
  const themeOptions = [
    { value: "Light", label: (<HStack><LuSun /> Light</HStack>) },
    { value: "Dark", label: (<HStack><LuMoon /> Dark</HStack>) },
    { value: "System", label: (<HStack><LuMonitor /> System Default</HStack>) }
  ];

  return (
    <>
      <Box p={6} maxW="800px" mx="auto">
        <VStack gap={6} align="stretch">
          <Heading size="lg">Settings</Heading>

          {/* Config file info card */}
          <Card.Root>
            <Card.Body>
              <Heading size="sm" mb={2}>Configuration File Location</Heading>
              <Flex alignItems="center" gap={2}>
                <Code
                  p={2}
                  borderRadius="md"
                  fontSize="sm"
                  flex="1"
                  overflow="hidden"
                  whiteSpace="nowrap"
                  textOverflow="ellipsis"
                >
                  {configPathLoading ? "Loading..." : configPath}
                </Code>
                <Tooltip
                  open={hasCopied}
                  content="Copied!"
                  openDelay={0}
                  immediate
                  showArrow
                >
                  <IconButton
                    aria-label="Copy config path"
                    size="sm"
                    onClick={handleCopyConfigPath}
                  >
                    <LuCopy />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Open config file" showArrow>
                  <IconButton
                    aria-label="Open config file"
                    size="sm"
                    onClick={handleOpenConfigFile}
                  >
                    <LuExternalLink />
                  </IconButton>
                </Tooltip>
              </Flex>
            </Card.Body>
          </Card.Root>

          <Card.Root>
            <Card.Body gap={4}>
              <Heading size="md">Appearance</Heading>
              <Separator />

              <Box>
                <Text fontWeight="medium" mb={2}>
                  Color Theme
                </Text>

                <SegmentGroup.Root
                  value={colorTheme}
                  onValueChange={(e) => {
                    setColorTheme(e.value as "Light" | "Dark" | "System");
                  }}
                >
                  <SegmentGroup.Indicator />
                  <SegmentGroup.Items items={themeOptions} />
                </SegmentGroup.Root>
              </Box>
            </Card.Body>

            <Card.Footer justifyContent="flex-end">
              <Button
                colorScheme="blue"
                onClick={handleSaveTheme}
                disabled={!hasUnsavedChanges()}
                loading={configSaving}
              >
                Save Changes
              </Button>
            </Card.Footer>
          </Card.Root>
        </VStack>
      </Box>

      {/* Unsaved Changes Warning Dialog */}
      <Dialog.Root modal={true} open={dialogState.isOpen}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxWidth="450px">
            <Dialog.Header>
              <Dialog.Title>Unsaved Changes</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger position="absolute" right="4" top="4" onClick={handleCancelTabChange} />
            <Dialog.Body>
              <Text>
                You have unsaved changes in Settings. Would you like to save your changes before leaving?
              </Text>
            </Dialog.Body>
            <Dialog.Footer gap={2}>
              <Button variant="outline" onClick={handleCancelTabChange}>
                Cancel
              </Button>
              <Button variant="outline" colorPalette="red" onClick={handleDiscardAndContinue}>
                Discard Changes
              </Button>
              <Button colorScheme="blue" onClick={handleSaveAndContinue}>
                Save Changes
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
}

export default Settings;
