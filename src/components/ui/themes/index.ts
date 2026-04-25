import { Default } from "./Default"
import { Metro } from "./Metro"
import { Yororen } from "./Yororen"

export const themes = {
    Default,
    Metro,
    Yororen,
} as const

export const themeNames = Object.keys(themes) as Array<keyof typeof themes>

export function getThemeDefinition(visualTheme?: string) {
    return themes[visualTheme as keyof typeof themes] ?? Default
}