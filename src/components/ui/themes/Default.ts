export const Default = {
    globalCss: {},
    semanticTokens: {
        colors: {
            app: {
                error: {
                    bg: { value: { base: "{colors.red.50}", _dark: "{colors.red.950}" } },
                    border: { value: { base: "{colors.red.100}", _dark: "{colors.red.900}" } },
                    title: { value: { base: "{colors.red.600}", _dark: "{colors.red.400}" } },
                    fg: { value: { base: "{colors.red.400}", _dark: "{colors.red.300}" } },
                },
                endpoint: {
                    peer: {
                        bg: { value: { base: "{colors.purple.50}", _dark: "{colors.purple.950}" } },
                        border: { value: { base: "{colors.purple.200}", _dark: "{colors.purple.800}" } },
                        fg: { value: { base: "{colors.purple.700}", _dark: "{colors.purple.300}" } },
                    },
                    client: {
                        bg: { value: { base: "{colors.blue.50}", _dark: "{colors.blue.950}" } },
                        border: { value: { base: "{colors.blue.200}", _dark: "{colors.blue.800}" } },
                        fg: { value: { base: "{colors.blue.700}", _dark: "{colors.blue.300}" } },
                    },
                },
            },
        },
    },
} as const