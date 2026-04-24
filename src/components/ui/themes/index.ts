import { Default } from "./Default"
import { Yororen } from "./Yororen"

export const themes = {
    Default,
    Yororen,
} as const

export const themeNames = Object.keys(themes) as Array<keyof typeof themes>

export function getThemeDefinition(visualTheme?: string) {
    return themes[visualTheme as keyof typeof themes] ?? Default
}