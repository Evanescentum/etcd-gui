import { useCallback, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Text,
  VStack,
  Dialog,
} from "@chakra-ui/react";
import { LuPlus, LuTrash2, LuServer, LuArrowRight, LuCheck, LuLock } from "react-icons/lu";
import { TbEdit } from "react-icons/tb";
import { Tooltip } from "../components/ui/tooltip";
import { toaster } from "../components/ui/toaster";
import { initializeEtcdClient } from "../api/etcd";
import type { AppConfig, Profile } from "../api/etcd";
import ProfileEditDialog from "./dialogs/ProfileEditDialog";
import { useDebounce } from "use-debounce";

interface ProfilesProps {
  onCurrentProfileChanged?: () => void;
  config: AppConfig | null;
  configLoading: boolean;
  onConfigUpdate: (config: AppConfig) => Promise<AppConfig>;
}

function Profiles({
  onCurrentProfileChanged,
  config,
  configLoading,
  onConfigUpdate,
}: ProfilesProps) {
  let [loading, setLoading] = useState(configLoading);
  [loading] = useDebounce(loading, 200);
  const [selectedProfile, setSelectedProfile] = useState<{
    profile: Profile,
    usedFor: "create" | "edit" | "delete"
  } | null>(null);

  const isCurrentProfile = useCallback((profileName: string) => {
    return config?.current_profile === profileName;
  }, [config]);

  const handleActivateProfile = async (profileName: string) => {
    if (!config) return;

    setLoading(true);

    // Update config with new active profile
    const updatedConfig = {
      ...config,
      current_profile: profileName
    };

    await onConfigUpdate(updatedConfig);

    // Reconnect to etcd with the new profile
    initializeEtcdClient();

    // Notify parent component about profile change
    onCurrentProfileChanged?.();

    setLoading(false);

  };

  const handleCreateProfile = () => {
    // Create an empty profile template
    let [prefix, postfix] = ["Profile", config?.profiles.length ?? 0 + 1];
    while (config?.profiles.some(p => p.name === `${prefix} ${postfix}`)) {
      postfix++;
    }

    const newProfile: Profile = {
      name: `${prefix} ${postfix}`,
      endpoints: [{ host: "http://localhost", port: 2379 }],
      timeout_ms: 5000,
      connect_timeout_ms: 3000
    };

    setSelectedProfile({
      profile: newProfile,
      usedFor: "create"
    });
  };

  const confirmDeleteProfile = async () => {
    if (!config || !selectedProfile) return;

    try {
      setLoading(true);

      // Filter out the profile to delete
      const updatedProfiles = config.profiles.filter(p => p.name !== selectedProfile.profile.name);

      // If we're deleting the active profile, clear the current_profile
      let current_profile = config.current_profile;
      if (current_profile === selectedProfile.profile.name) {
        current_profile = updatedProfiles.length > 0 ? updatedProfiles[0].name : null;
      }

      const updatedConfig = {
        ...config,
        profiles: updatedProfiles,
        current_profile
      };

      await onConfigUpdate(updatedConfig);

      // If we changed the active profile, reconnect
      if (current_profile !== config.current_profile) {
        await initializeEtcdClient();
      }

      // Notify parent component about profile change
      if (current_profile !== config.current_profile) {
        onCurrentProfileChanged?.();
      }

      toaster.create({
        title: "Profile Deleted",
        description: `Profile ${selectedProfile?.profile.name} has been deleted`,
        type: "success",
        meta: { closable: true },
      });

      setSelectedProfile(null);
    } catch (error) {
      console.error("Failed to delete profile:", error);
      toaster.create({
        title: "Error",
        description: "Failed to delete profile",
        type: "error",
        meta: { closable: true },
      });
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (profile: Profile) => {
    if (!config) return;

    try {
      setLoading(true);

      let updatedProfiles: Profile[];
      const existingIndex = config.profiles.findIndex(p => p.name === profile.name);

      if (existingIndex >= 0) {
        // Update existing profile
        updatedProfiles = [...config.profiles];
        updatedProfiles[existingIndex] = profile;
      } else {
        // Add new profile
        updatedProfiles = [...config.profiles, profile];
      }

      const updatedConfig = {
        ...config,
        profiles: updatedProfiles,
      };

      await onConfigUpdate(updatedConfig);

      if (profile.name === config.current_profile) {
        await initializeEtcdClient();
      }

      toaster.create({
        title: existingIndex >= 0 ? "Profile Updated" : "Profile Created",
        description: `Profile ${profile.name} has been ${existingIndex >= 0 ? 'updated' : 'created'}`,
        type: "success",
        meta: { closable: true },
      });

      setSelectedProfile(null);
    } catch (error) {
      console.error("Failed to save profile:", error);
      toaster.create({
        title: "Error",
        description: "Failed to save profile",
        type: "error",
        meta: { closable: true },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={6}>
      <VStack gap={6} align="stretch">
        <Flex justify="space-between" align="center">
          <Heading size="lg">Connection Profiles</Heading>
          <Button
            onClick={handleCreateProfile}
            loading={loading}
          ><LuPlus />
            Add Profile
          </Button>
        </Flex>

        <Text color="gray.600">
          Create and manage your etcd connection profiles
        </Text>

        {/* Profile list */}
        <Box mt={4}>
          {
            <VStack gap={3} align="stretch">
              {config?.profiles.map((profile) => (
                <Box
                  key={profile.name}
                  p={4}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={isCurrentProfile(profile.name) ? "blue.fg" : "gray.muted"}
                  bg={isCurrentProfile(profile.name) ? "bg.emphasized" : "bg.info"}
                  position="relative"
                >
                  <Flex align="center">
                    <Box p={2} borderRadius="md" bg={isCurrentProfile(profile.name) ? "blue.300" : "gray.300"}>
                      <LuServer />
                    </Box>

                    <VStack ml={4} align="flex-start" flex={1} gap={0}>
                      <Flex align="center" gap={2}>
                        <Text fontWeight="bold">{profile.name}</Text>
                        {profile.locked && (
                          <Tooltip content="Read-only mode" openDelay={100} closeDelay={200}><LuLock /></Tooltip>
                        )}
                      </Flex>
                      <Text fontSize="sm" color="gray.600">
                        {profile.endpoints.map(e => `${e.host}:${e.port}`).join(", ")}
                      </Text>
                    </VStack>

                    <HStack gap={2}>
                      {isCurrentProfile(profile.name) ? (
                        <Button
                          size="sm"
                          colorPalette="blue"
                          variant="ghost"
                          disabled
                        >
                          <Box mr={2}><LuCheck /></Box>
                          Active
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivateProfile(profile.name)}
                          loading={loading}
                        >
                          <Box mr={2}><LuArrowRight /></Box>
                          Connect
                        </Button>
                      )}

                      <Tooltip content="Edit profile" showArrow>
                        <IconButton
                          aria-label="Edit profile"
                          children={<TbEdit />}
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelectedProfile({ profile: profile, usedFor: "edit" }); }}
                        />
                      </Tooltip>

                      <Tooltip content="Delete profile" showArrow>
                        <IconButton
                          aria-label="Delete profile"
                          children={<LuTrash2 />}
                          size="sm"
                          colorPalette="red"
                          variant="ghost"
                          onClick={() => { setSelectedProfile({ profile, usedFor: "delete" }); }}
                          disabled={config.profiles.length <= 1}
                        />
                      </Tooltip>
                    </HStack>
                  </Flex>
                </Box>
              ))}
            </VStack>
          }
        </Box>
      </VStack>

      {/* Edit Profile Dialog */}
      {selectedProfile && selectedProfile.usedFor != "delete" && (
        <ProfileEditDialog
          profile={selectedProfile.profile}
          onSave={saveProfile}
          onCancel={() => setSelectedProfile(null)}
          loading={loading}
          isNew={selectedProfile.usedFor === "create"}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {selectedProfile && selectedProfile.usedFor === "delete" && (
        <Dialog.Root modal={true} open={true}>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete Profile</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger position="absolute" right="4" top="4" onClick={() => setSelectedProfile(null)} />
              <Dialog.Body>
                <VStack gap={4} align="stretch">
                  <Text>
                    Are you sure you want to delete the profile "{selectedProfile.profile.name}"?
                  </Text>
                  {config?.current_profile === selectedProfile.profile.name && (
                    <Text color="red.solid">
                      Warning: This is your active profile. Deleting it will connect you to another available profile.
                    </Text>
                  )}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" mr={3} onClick={() => setSelectedProfile(null)}>
                  Cancel
                </Button>
                <Button
                  colorPalette="red"
                  onClick={confirmDeleteProfile}
                  loading={loading}
                >
                  Delete
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      )}
    </Box>
  );
}

export default Profiles;
