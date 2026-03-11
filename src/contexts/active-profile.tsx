import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppConfig, Profile } from "../api/etcd";

export interface ActiveProfileContextValue {
    activeProfile: Profile;
    appConfig: AppConfig;
}

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null);

interface ActiveProfileProviderProps {
    appConfig: AppConfig;
    activeProfile: Profile;
    children: ReactNode;
}

export function ActiveProfileProvider({ appConfig, activeProfile, children }: ActiveProfileProviderProps) {
    const value = useMemo(() => ({
        activeProfile,
        appConfig,
    }), [activeProfile, appConfig]);

    return <ActiveProfileContext value={value}>{children}</ActiveProfileContext>;
}

/**
 * Get current active profile.
 */
export function useActiveProfile(): ActiveProfileContextValue {
    const context = useContext(ActiveProfileContext);

    if (!context) {
        throw new Error("useActiveProfile must be used within an ActiveProfileProvider");
    }

    return context;
}