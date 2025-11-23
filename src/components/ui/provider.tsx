"use client"

import { ChakraProvider, defaultSystem, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { useMemo } from "react"

interface ProviderProps extends ColorModeProviderProps {
  fontFamilyBody?: string
  fontFamilyMono?: string
}

export function Provider(props: ProviderProps) {
  const { fontFamilyBody, fontFamilyMono, ...rest } = props

  const system = useMemo(() => {
    if (!fontFamilyBody && !fontFamilyMono) return defaultSystem

    const fonts: Record<string, { value: string }> = {}
    if (fontFamilyBody) {
      fonts.body = { value: fontFamilyBody }
      fonts.heading = { value: fontFamilyBody }
    }
    if (fontFamilyMono) {
      fonts.mono = { value: fontFamilyMono }
    }

    const config = defineConfig({
      theme: {
        tokens: {
          fonts,
        },
      },
    })

    return createSystem(defaultConfig, config)
  }, [fontFamilyBody, fontFamilyMono])

  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...rest} />
    </ChakraProvider>
  )
}
