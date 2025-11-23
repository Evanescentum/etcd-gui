import { useState, useEffect, useRef, RefObject } from "react";
import { useForm, Controller } from "react-hook-form";
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
  Select,
  createListCollection,
  ScrollArea,
} from "@chakra-ui/react";
import type { AppConfig } from "../../api/etcd";
import { getConfigFilePath, openConfigFile, openConfigFolder, openDevtools, getSystemFonts } from "../../api/etcd";
import { toaster } from "../ui/toaster";
import { LuMonitor, LuSun, LuMoon, LuCopy, LuExternalLink, LuFolderOpen, LuBug } from "react-icons/lu";
import { Tooltip } from "../ui/tooltip";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

// --- Hooks ---

/**
 * Hook to handle unsaved changes interception
 * Connects to the parent's tab controller via ref and manages the interception promise
 */
function useUnsavedChanges(
  isDirty: boolean,
  ref?: RefObject<((newTab: string) => Promise<boolean>) | null>
) {
  const [resolveFunc, setResolveFunc] = useState<((allow: boolean) => void) | null>(null);

  useEffect(() => {
    if (!ref) return;

    // Mount the interceptor to the ref
    ref.current = async () => {
      if (!isDirty) return true; // Allow navigation if no changes

      // Block navigation and return a promise that resolves when user interacts with dialog
      return new Promise<boolean>((resolve) => {
        setResolveFunc(() => resolve);
      });
    };

    // Cleanup
    return () => {
      if (ref) ref.current = null;
    };
  }, [isDirty, ref]);

  return {
    showDialog: !!resolveFunc,
    confirmNavigation: () => {
      setResolveFunc(null);
      // Delay resolution slightly to allow the dialog close animation/state update to process
      // before the parent component hides this view.
      setTimeout(() => { resolveFunc?.(true); }, 10);
    },
    cancelNavigation: () => {
      setResolveFunc(null);
      setTimeout(() => { resolveFunc?.(false); }, 10);
    }
  };
}

// --- Sub-components ---

const ConfigFileSection = () => {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const p = await getConfigFilePath();
        setPath(p.startsWith("\\\\?\\") ? p.substring(4) : p);
      } catch (e) {
        console.error("Failed to get config path", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCopy = async () => {
    await writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 800);
  };

  const handleOpen = async () => {
    try { await openConfigFile(); }
    catch { toaster.create({ title: "Error", description: "Failed to open configuration file", type: "error" }); }
  };

  const handleOpenFolder = async () => {
    try { await openConfigFolder(); }
    catch { toaster.create({ title: "Error", description: "Failed to open configuration folder", type: "error" }); }
  };

  return (
    <Card.Root>
      <Card.Body>
        <Heading size="sm" mb={2}>Configuration File Location</Heading>
        <Flex alignItems="center" gap={2}>
          <Code p={2} borderRadius="md" fontSize="sm" flex="1" overflow="hidden" whiteSpace="nowrap" textOverflow="ellipsis">
            {loading ? "Loading..." : path}
          </Code>
          <Tooltip open={copied} content="Copied!" openDelay={0} immediate showArrow>
            <IconButton aria-label="Copy config path" size="sm" onClick={handleCopy}><LuCopy /></IconButton>
          </Tooltip>
          <Tooltip content="Open config file" showArrow>
            <IconButton aria-label="Open config file" size="sm" onClick={handleOpen}><LuExternalLink /></IconButton>
          </Tooltip>
          <Tooltip content="Open config folder" showArrow>
            <IconButton aria-label="Open config folder" size="sm" onClick={handleOpenFolder}><LuFolderOpen /></IconButton>
          </Tooltip>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
};

const DevToolsSection = () => {
  const handleOpen = async () => {
    try { await openDevtools(); }
    catch { toaster.create({ title: "Error", description: "Failed to open developer tools", type: "error" }); }
  };

  return (
    <Card.Root>
      <Card.Body>
        <Heading size="sm" mb={2}>Developer Tools</Heading>
        <Text fontSize="sm" color="fg.muted" mb={3}>Access developer tools for debugging and troubleshooting</Text>
        <Flex alignItems="center" gap={2}>
          <Button size="sm" variant="outline" onClick={handleOpen}>
            <HStack><LuBug /><Text>Open Console</Text></HStack>
          </Button>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
};

interface UnsavedChangesDialogProps {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

const UnsavedChangesDialog = ({ open, onCancel, onDiscard, onSave }: UnsavedChangesDialogProps) => (
  <Dialog.Root modal={true} open={open}>
    <Dialog.Backdrop />
    <Dialog.Positioner>
      <Dialog.Content maxWidth="450px">
        <Dialog.Header><Dialog.Title>Unsaved Changes</Dialog.Title></Dialog.Header>
        <Dialog.CloseTrigger position="absolute" right="4" top="4" onClick={onCancel} />
        <Dialog.Body>
          <Text>You have unsaved changes in Settings. Would you like to save your changes before leaving?</Text>
        </Dialog.Body>
        <Dialog.Footer gap={2}>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" colorPalette="red" onClick={onDiscard}>Discard Changes</Button>
          <Button onClick={onSave}>Save Changes</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Positioner>
  </Dialog.Root>
);

// --- Main Component ---

interface SettingsProps {
  config: AppConfig;
  saveConfig: (config: AppConfig) => Promise<void>;
  onBeforeTabChange?: RefObject<((newTab: string) => Promise<boolean>) | null>;
  onConfigChange?: (config: AppConfig) => void;
  onDiscard?: () => void;
}

function Settings({ config, saveConfig, onBeforeTabChange, onConfigChange, onDiscard }: SettingsProps) {
  const { control, handleSubmit, reset, watch, formState: { isDirty, isSubmitting } } = useForm<AppConfig>({
    defaultValues: config,
  });

  // Use custom hook for tab interception
  const { showDialog, confirmNavigation, cancelNavigation } = useUnsavedChanges(isDirty, onBeforeTabChange);

  const isResettingRef = useRef(false);

  // Sync form with config prop changes
  useEffect(() => {
    isResettingRef.current = true;
    reset(config);
    isResettingRef.current = false;
  }, [config, reset]);

  // Update global config preview
  useEffect(() => {
    const subscription = watch((value) => {
      if (onConfigChange && !isResettingRef.current) {
        onConfigChange(value as AppConfig);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, onConfigChange]);

  // Form submission
  const onSubmit = async (data: AppConfig) => {
    try {
      await saveConfig(data);
      reset(data);
      toaster.create({ title: "Settings saved", description: "Your preferences have been updated", type: "success", closable: true });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toaster.create({ title: "Error", description: "Failed to save settings", type: "error", closable: true });
    }
  };

  const handleSaveAndContinue = async () => {
    await handleSubmit(onSubmit)();
    confirmNavigation();
  };

  const handleDiscardAndContinue = () => {
    reset(config);
    onDiscard?.();
    confirmNavigation();
  };

  const themeOptions = [
    { value: "Light", label: (<HStack><LuSun /> Light</HStack>) },
    { value: "Dark", label: (<HStack><LuMoon /> Dark</HStack>) },
    { value: "System", label: (<HStack><LuMonitor /> System Default</HStack>) }
  ];

  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  useEffect(() => {
    getSystemFonts().then(setSystemFonts);
  }, []);

  const fontItems = [
    { label: "System", value: "" },
    ...systemFonts.map(font => ({ label: font, value: font })),
  ];

  const uiFontCollection = createListCollection({ items: fontItems });
  const codeFontCollection = createListCollection({ items: fontItems });

  return (
    <>
      <ScrollArea.Root h="100%" w="100%">
        <ScrollArea.Viewport h="100%" w="100%">
          <ScrollArea.Content>
            <Box p={6} maxW="800px" mx="auto">
              <VStack gap={6} align="stretch">
                <Heading size="lg">Settings</Heading>

                <ConfigFileSection />

                <form onSubmit={handleSubmit(onSubmit)}>
                  <Card.Root>
                    <Card.Body gap={4}>
                      <Heading size="md">Appearance</Heading>
                      <Separator />
                      <Box fontSize="sm">
                        <Text fontWeight="medium" mb={2}>Color Theme</Text>
                        <Controller
                          name="color_theme"
                          control={control}
                          render={({ field }) => (
                            <SegmentGroup.Root value={field.value} onValueChange={(e) => field.onChange(e.value)}>
                              <SegmentGroup.Indicator />
                              <SegmentGroup.Items items={themeOptions} />
                            </SegmentGroup.Root>
                          )}
                        />
                      </Box>
                      <Box fontSize="sm">
                        <Text fontWeight="medium" mb={2}>UI Font Family</Text>
                        <Controller
                          name="font_family_body"
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={uiFontCollection}
                              value={[field.value || ""]}
                              onValueChange={(e) => field.onChange(e.value[0])}
                            >
                              <Select.Trigger>
                                <Select.ValueText placeholder="System" />
                              </Select.Trigger>
                              <Select.Positioner>
                                <Select.Content>
                                  {uiFontCollection.items.map((item) => (
                                    <Select.Item
                                      item={item}
                                      key={item.value}
                                      fontFamily={item.value || "system-ui, sans-serif"}
                                    >
                                      {item.label}
                                    </Select.Item>
                                  ))}
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Box>
                      <Box fontSize="sm">
                        <Text fontWeight="medium" mb={2}>Code Font Family</Text>
                        <Controller
                          name="font_family_mono"
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={codeFontCollection}
                              value={[field.value || ""]}
                              onValueChange={(e) => field.onChange(e.value[0])}
                            >
                              <Select.Trigger>
                                <Select.ValueText placeholder="System" />
                              </Select.Trigger>
                              <Select.Positioner>
                                <Select.Content>
                                  {codeFontCollection.items.map((item) => (
                                    <Select.Item
                                      item={item}
                                      key={item.value}
                                      fontFamily={item.value || "mono"}
                                    >
                                      {item.label}
                                    </Select.Item>
                                  ))}
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Box>
                    </Card.Body>
                    <Card.Footer justifyContent="flex-end">
                      <Button type="submit" disabled={!isDirty} loading={isSubmitting}>Save Changes</Button>
                    </Card.Footer>
                  </Card.Root>
                </form>

                <DevToolsSection />
              </VStack>
            </Box>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar />
        <ScrollArea.Corner />
      </ScrollArea.Root>

      <UnsavedChangesDialog
        open={showDialog}
        onCancel={cancelNavigation}
        onDiscard={handleDiscardAndContinue}
        onSave={handleSaveAndContinue}
      />
    </>
  );
}

export default Settings;
