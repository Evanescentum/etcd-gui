"use client"

import { ChakraProvider, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { useMemo } from "react"
import { getThemeDefinition } from "./themes"

interface ProviderProps extends ColorModeProviderProps {
  visualTheme?: string
  fontFamilyBody?: string
  fontFamilyMono?: string
}

export function Provider(props: ProviderProps) {
  const { visualTheme = "Default", fontFamilyBody, fontFamilyMono, ...rest } = props

  const system = useMemo(() => {
    const fonts: Record<string, { value: string }> = {}
    if (fontFamilyBody) {
      fonts.body = { value: fontFamilyBody }
      fonts.heading = { value: fontFamilyBody }
    }
    if (fontFamilyMono) {
      fonts.mono = { value: fontFamilyMono }
    }

    const resolvedTheme = getThemeDefinition(visualTheme)
    const { globalCss, ...themeDefinition } = resolvedTheme
    const resolvedTokens = "tokens" in themeDefinition ? themeDefinition.tokens : undefined
    const resolvedFontTokens: Record<string, { value: string }> = resolvedTokens && "fonts" in resolvedTokens
      ? (resolvedTokens.fonts as Record<string, { value: string }>)
      : {}

    const theme = Object.keys(fonts).length > 0
      ? {
        ...themeDefinition,
        tokens: {
          ...resolvedTokens,
          fonts: {
            ...resolvedFontTokens,
            ...fonts,
          },
        },
      }
      : themeDefinition

    const config = defineConfig({ theme, globalCss })

    return createSystem(defaultConfig, config)
  }, [fontFamilyBody, fontFamilyMono, visualTheme])

  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...rest} />
    </ChakraProvider>
  )
}
