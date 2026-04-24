import type { VisualTheme } from "../../../api/etcd"
import { defaultTheme } from "./default-theme"

const themes = {
    Default: defaultTheme,
} as const

export function getThemeDefinition(visualTheme: VisualTheme) {
    return themes[visualTheme] ?? defaultTheme
}