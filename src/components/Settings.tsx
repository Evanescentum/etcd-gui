import { useState, useEffect } from "react";
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
  onSettingChange?: (hasChanges: boolean) => void;
  onRequestSave?: MutableRefObject<(() => Promise<void>) | undefined>;
  onRequestDiscard?: MutableRefObject<(() => void) | undefined>;
  config: AppConfig | null;
  onConfigUpdate: (config: AppConfig) => Promise<AppConfig>;
}

function Settings({
  onSettingChange,
  onRequestSave,
  onRequestDiscard,
  config,
  onConfigUpdate
}: SettingsProps) {
  const [saving, setSaving] = useState(false);
  const [colorTheme, setColorTheme] = useState<"Light" | "Dark" | "System">("System");
  // Track original theme from config to detect changes
  const [originalTheme, setOriginalTheme] = useState<"Light" | "Dark" | "System">("System");
  // Add state for config file path
  const [configPath, setConfigPath] = useState<string>("");
  const [configPathLoading, setConfigPathLoading] = useState(false);

  const [hasCopied, setHasCopied] = useState(false);
  const { setColorMode, colorMode } = useColorMode();

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

  // Handle opening config file - now it uses the backend implementation
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
    if (!config) return;

    try {
      setSaving(true);

      // Update config with new theme
      const updatedConfig = {
        ...config,
        color_theme: colorTheme,
      };

      await onConfigUpdate(updatedConfig);
      setOriginalTheme(colorTheme); // Update original theme after successful save

      toaster.create({
        title: "Settings saved",
        description: "Your theme preference has been updated",
        type: "success",
        meta: { closable: true },
      });

      // Notify parent component of successful save
      onSettingChange?.(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toaster.create({
        title: "Error",
        description: "Failed to save settings",
        type: "error",
        meta: { closable: true },
      });
    } finally {
      setSaving(false);
    }
  };

  // Expose save method to parent component
  useEffect(() => {
    if (onRequestSave) {
      // When parent requests to save changes
      onRequestSave.current = handleSaveTheme;
    }
  }, [onRequestSave]);

  // Expose discard changes method to parent component
  useEffect(() => {
    if (onRequestDiscard) {
      // When parent requests to discard changes
      onRequestDiscard.current = () => {
        if (config) {
          setColorTheme(originalTheme);
          onSettingChange?.(false);
        }
      };
    }
  }, [onRequestDiscard, originalTheme, config, onSettingChange]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!config) return false;
    return colorTheme !== originalTheme;
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

    return () => {
      // Reset color mode to system default when component unmounts
      setColorMode(colorMode);
    }
  }, [colorTheme])

  // Theme options with icons
  const themeOptions = [
    { value: "Light", label: (<HStack><LuSun /> Light</HStack>) },
    { value: "Dark", label: (<HStack><LuMoon /> Dark</HStack>) },
    { value: "System", label: (<HStack><LuMonitor /> System Default</HStack>) }
  ];

  return (
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
                onValueChange={(e) => setColorTheme(e.value as "Light" | "Dark" | "System")}
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
              loading={saving}
            >
              Save Changes
            </Button>
          </Card.Footer>
        </Card.Root>
      </VStack>
    </Box>
  );
}

export default Settings;
