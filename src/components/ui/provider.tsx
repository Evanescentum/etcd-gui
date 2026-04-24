"use client"

import { ChakraProvider, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import type { VisualTheme } from "../../api/etcd"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { useMemo } from "react"
import { getThemeDefinition } from "./themes"

interface ProviderProps extends ColorModeProviderProps {
  visualTheme?: VisualTheme
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

    const theme = Object.keys(fonts).length > 0
      ? {
        ...resolvedTheme,
        tokens: {
          fonts,
        },
      }
      : resolvedTheme

    const config = defineConfig({ theme })

    return createSystem(defaultConfig, config)
  }, [fontFamilyBody, fontFamilyMono, visualTheme])

  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...rest} />
    </ChakraProvider>
  )
}
