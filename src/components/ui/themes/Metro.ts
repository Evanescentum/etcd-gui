import { defineRecipe, defineSlotRecipe } from "@chakra-ui/react"
import {
    cardAnatomy,
    comboboxAnatomy,
    checkboxAnatomy,
    dialogAnatomy,
    emptyStateAnatomy,
    fieldAnatomy,
    scrollAreaAnatomy,
    segmentGroupAnatomy,
    selectAnatomy,
    statAnatomy,
    switchAnatomy,
    tableAnatomy,
    tabsAnatomy,
} from "@chakra-ui/react/anatomy"

const quietButtonHoverBg = { _light: "colorPalette.muted", _dark: "colorPalette.subtle" } as const

const colorPair = (_light: string, _dark: string) => ({ _light, _dark }) as const

const semanticColor = (_light: string, _dark: string) => ({ value: colorPair(_light, _dark) }) as const

const fieldHoverBg = { _light: "#f7f7f7", _dark: "#3c3c3c" } as const

const surfaceDefault = semanticColor("#f3f3f3", "#1d1d1d")
const surfaceSubtle = semanticColor("#ececec", "#2e2e2e")
const surfacePanel = semanticColor("#fbfbfb", "#3f3f3f")
const surfaceEmphasized = semanticColor("#ececec", "#3f3f3f")

const textDefault = semanticColor("#17181A", "#fbfbfb")
const textMuted = semanticColor("#5f5f5f", "#ececec")
const textSubtle = semanticColor("#7a7a7a", "#f3f3f3")
const textEmphasized = semanticColor("#0B0C0D", "#FFFFFF")

const borderDefault = semanticColor("#ececec", "#3f3f3f")
const borderMuted = semanticColor("#f3f3f3", "#2e2e2e")
const borderSubtle = semanticColor("#fbfbfb", "#1d1d1d")
const borderEmphasized = semanticColor("#0F6CBD", "#5EB2FF")

const grayEmphasized = semanticColor("#3f3f3f", "#fbfbfb")
const graySolid = semanticColor("#3f3f3f", "#f3f3f3")

const outlinedField = {
    borderWidth: "0",
    bg: "bg.panel",
    focusVisibleRing: "inside",
    focusRingColor: "transparent",
    boxShadow: "inset 0 -1px 0 0 {colors.border.default}",
    _hover: {
        bg: fieldHoverBg,
        boxShadow: "inset 0 -2px 0 0 {colors.border.muted}",
    },
} as const

const subtleField = {
    borderWidth: "0",
    bg: "bg.subtle",
    focusVisibleRing: "inside",
    focusRingColor: "transparent",
    boxShadow: "inset 0 -1px 0 0 {colors.border.muted}",
} as const

const dropdownScrollbar = {
    scrollbarWidth: "thin",
    scrollbarColor: "{colors.border.default} transparent",
    "&::-webkit-scrollbar": {
        width: "10px",
    },
    "&::-webkit-scrollbar-track": {
        bg: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
        bg: "border.default",
        borderRadius: "0",
        borderLeftWidth: "3px",
        borderLeftColor: "transparent",
        borderRightWidth: "3px",
        borderRightColor: "transparent",
        backgroundClip: "padding-box",
    },
    "&::-webkit-scrollbar-thumb:hover": {
        bg: "border.emphasized",
    },
} as const

const dropdownSurface = {
    background: "bg.panel",
    display: "flex",
    flexDirection: "column",
    zIndex: "dropdown",
    borderRadius: "md",
    borderWidth: "1px",
    borderColor: "border.default",
    outline: 0,
    maxH: "96",
    boxShadow: "sm",
    ...dropdownScrollbar,
} as const

const buttonRecipe = defineRecipe({
    base: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        appearance: "none",
        userSelect: "none",
        position: "relative",
        verticalAlign: "middle",
        flexShrink: "0",
        outline: "0",
        lineHeight: "1.2",
        isolation: "isolate",
        whiteSpace: "nowrap",
        fontWeight: "medium",
        transitionProperty: "common",
        transitionDuration: "fast",
        focusVisibleRing: "none",
        _disabled: {
            layerStyle: "disabled",
        },
        _icon: {
            flexShrink: "0",
        },
    },
    variants: {
        size: {
            xs: {
                h: "8",
                minW: "8",
                textStyle: "xs",
                px: "3",
                gap: "1.5",
            },
            sm: {
                h: "8",
                minW: "8",
                textStyle: "sm",
                px: "3.5",
                gap: "2",
            },
            md: {
                h: "9",
                minW: "9",
                textStyle: "sm",
                px: "4",
                gap: "2",
            },
            lg: {
                h: "10",
                minW: "10",
                textStyle: "md",
                px: "5",
                gap: "2.5",
            },
        },
        variant: {
            solid: {
                bg: "colorPalette.solid",
                color: "colorPalette.contrast",
                boxShadow: "0 1px 0 rgba(255, 255, 255, 0.16) inset, 0 1px 2px rgba(16, 24, 39, 0.12)",
                _hover: {
                    bg: "colorPalette.emphasized",
                },
                _expanded: {
                    bg: "colorPalette.emphasized",
                },
                _active: {
                    bg: "colorPalette.focusRing",
                },
            },
            subtle: {
                bg: "colorPalette.subtle",
                color: "colorPalette.fg",
                boxShadow: "inset 0 0 0 1px {colors.colorPalette.border}",
                _hover: {
                    bg: "colorPalette.muted",
                },
                _expanded: {
                    bg: "colorPalette.muted",
                },
            },
            outline: {
                borderWidth: "1px",
                borderColor: "colorPalette.border",
                bg: "colorPalette.contrast",
                color: "colorPalette.fg",
                boxShadow: "none",
                _hover: {
                    bg: quietButtonHoverBg,
                },
                _expanded: {
                    bg: quietButtonHoverBg,
                },
            },
            ghost: {
                color: "colorPalette.fg",
                bg: "transparent",
                _hover: {
                    bg: quietButtonHoverBg,
                },
                _expanded: {
                    bg: quietButtonHoverBg,
                },
            },
            plain: {
                color: "colorPalette.fg",
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "solid",
    },
})

const inputRecipe = defineRecipe({
    base: {
        width: "100%",
        minWidth: "0",
        outline: "0",
        position: "relative",
        appearance: "none",
        textAlign: "start",
        borderRadius: "md",
        bg: "bg.panel",
        _disabled: {
            layerStyle: "disabled",
            bg: "bg.subtle",
        },
        height: "var(--input-height)",
        minW: "var(--input-height)",
        "--focus-color": "colors.border.emphasized",
        "--error-color": "colors.red.500",
        _invalid: {
            focusRingColor: "var(--error-color)",
            borderColor: "var(--error-color)",
        },
    },
    variants: {
        size: {
            xs: { textStyle: "xs", px: "2", "--input-height": "sizes.8" },
            sm: { textStyle: "sm", px: "2.5", "--input-height": "sizes.8" },
            md: { textStyle: "sm", px: "3", "--input-height": "sizes.9" },
            lg: { textStyle: "md", px: "4", "--input-height": "sizes.10" },
        },
        variant: {
            outline: {
                ...outlinedField,
                _focusVisible: {
                    boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                },
            },
            subtle: {
                ...subtleField,
                _focusVisible: {
                    boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                },
            },
            flushed: {
                bg: "transparent",
                borderBottomWidth: "1px",
                borderBottomColor: "border.default",
                borderRadius: "0",
                px: "0",
                _focusVisible: {
                    borderColor: "var(--focus-color)",
                    boxShadow: "0px 2px 0px 0px var(--focus-color)",
                },
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "outline",
    },
})

const textareaRecipe = defineRecipe({
    base: {
        width: "100%",
        minWidth: "0",
        outline: "0",
        position: "relative",
        appearance: "none",
        textAlign: "start",
        borderRadius: "md",
        bg: "bg.panel",
        _disabled: {
            layerStyle: "disabled",
            bg: "bg.subtle",
        },
        "--focus-color": "colors.border.emphasized",
        "--error-color": "colors.red.500",
        _invalid: {
            focusRingColor: "var(--error-color)",
            borderColor: "var(--error-color)",
        },
    },
    variants: {
        size: {
            sm: { textStyle: "sm", px: "2.5", py: "2", scrollPaddingBottom: "2" },
            md: { textStyle: "sm", px: "3", py: "2.5", scrollPaddingBottom: "2.5" },
            lg: { textStyle: "md", px: "4", py: "3", scrollPaddingBottom: "3" },
        },
        variant: {
            outline: {
                ...outlinedField,
                _focusVisible: {
                    boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                },
            },
            subtle: {
                ...subtleField,
                _focusVisible: {
                    boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                },
            },
            flushed: {
                bg: "transparent",
                borderBottomWidth: "1px",
                borderBottomColor: "border.default",
                borderRadius: "0",
                px: "0",
                _focusVisible: {
                    borderColor: "var(--focus-color)",
                    boxShadow: "0px 2px 0px 0px var(--focus-color)",
                },
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "outline",
    },
})

const badgeRecipe = defineRecipe({
    base: {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "md",
        gap: "1",
        fontWeight: "medium",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        userSelect: "none",
    },
    variants: {
        variant: {
            solid: {
                bg: "colorPalette.solid",
                color: "colorPalette.contrast",
            },
            subtle: {
                bg: "colorPalette.subtle",
                color: "colorPalette.fg",
            },
            outline: {
                color: "colorPalette.fg",
                borderWidth: "1px",
                borderColor: "colorPalette.border",
                bg: "transparent",
            },
            surface: {
                bg: "colorPalette.subtle",
                color: "colorPalette.fg",
                borderWidth: "1px",
                borderColor: "colorPalette.muted",
            },
            plain: {
                color: "colorPalette.fg",
            },
        },
        size: {
            xs: { textStyle: "2xs", px: "1.5", minH: "4" },
            sm: { textStyle: "xs", px: "2", minH: "5" },
            md: { textStyle: "sm", px: "2.5", minH: "6" },
        },
    },
    defaultVariants: {
        variant: "subtle",
        size: "sm",
    },
})

const codeRecipe = defineRecipe({
    base: {
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "mono",
        borderRadius: "md",
        bg: "bg.muted",
        color: "fg",
        boxShadow: "none",
    },
    variants: badgeRecipe.variants,
    defaultVariants: badgeRecipe.defaultVariants,
})

const fieldSlotRecipe = defineSlotRecipe({
    slots: fieldAnatomy.keys(),
    base: {
        root: {
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
        },
        label: {
            color: "fg.emphasized",
            fontWeight: "medium",
            textStyle: "sm",
        },
        helperText: {
            color: "fg.subtle",
            textStyle: "xs",
        },
        errorText: {
            color: "red.500",
            textStyle: "xs",
            fontWeight: "medium",
        },
        requiredIndicator: {
            color: "border.emphasized",
        },
    },
})

const checkboxSlotRecipe = defineSlotRecipe({
    slots: checkboxAnatomy.keys(),
    base: {
        root: {
            display: "inline-flex",
            alignItems: "center",
            gap: "2",
            color: "fg",
        },
        control: {
            width: "4.5",
            height: "4.5",
            borderRadius: "md",
            borderWidth: "1px",
            borderColor: "border.subtle",
            bg: "bg",
            color: "white",
            transitionProperty: "common",
            transitionDuration: "fast",
            _checked: {
                bg: "border.emphasized",
                borderColor: "border.emphasized",
            },
            _indeterminate: {
                bg: "border.emphasized",
                borderColor: "border.emphasized",
            },
            _invalid: {
                borderColor: "red.500",
            },
            _disabled: {
                bg: "bg.subtle",
                borderColor: "border.muted",
            },
            _focusVisible: {
                outline: "2px solid",
                outlineColor: "border.emphasized",
                outlineOffset: "2px",
            },
        },
        label: {
            color: "fg",
            textStyle: "sm",
        },
    },
})

const switchSlotRecipe = defineSlotRecipe({
    slots: switchAnatomy.keys(),
    base: {
        root: {
            display: "inline-flex",
            alignItems: "center",
            gap: "2",
            position: "relative",
            verticalAlign: "middle",
            "--switch-diff": "calc(var(--switch-width) - var(--switch-height))",
            "--switch-x": {
                base: "var(--switch-diff)",
                _rtl: "calc(var(--switch-diff) * -1)",
            },
        },
        indicator: {
            position: "absolute",
            height: "var(--switch-height)",
            width: "var(--switch-height)",
            fontSize: "var(--switch-indicator-font-size)",
            fontWeight: "medium",
            flexShrink: 0,
            userSelect: "none",
            display: "grid",
            placeContent: "center",
            transition: "inset-inline-start 0.12s ease",
            insetInlineStart: "calc(var(--switch-x) - 2px)",
            _checked: {
                insetInlineStart: "2px",
            },
        },
        control: {
            display: "inline-flex",
            justifyContent: "flex-start",
            flexShrink: 0,
            cursor: "switch",
            position: "relative",
            width: "var(--switch-width)",
            height: "var(--switch-height)",
            borderRadius: "0",
            borderWidth: "0",
            bg: "bg.emphasized",
            transitionProperty: "common",
            transitionDuration: "fast",
            _checked: {
                bg: "border.emphasized",
            },
            _disabled: {
                opacity: 0.6,
                cursor: "not-allowed",
            },
            _focusVisible: {
                outline: "2px solid",
                outlineColor: "border.emphasized",
                outlineOffset: "2px",
            },
        },
        thumb: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: "var(--switch-height)",
            height: "var(--switch-height)",
            bg: "white",
            borderRadius: "0",
            boxShadow: "none",
            transitionProperty: "translate",
            transitionDuration: "fast",
            scale: "0.78",
            _checked: {
                translate: "var(--switch-x) 0",
                bg: "white",
            },
        },
        label: {
            color: "fg",
            textStyle: "sm",
            fontWeight: "medium",
        },
    },
    variants: {
        variant: {
            solid: {
                control: {
                    borderRadius: "0",
                    bg: "bg.emphasized",
                    _checked: {
                        bg: "border.emphasized",
                    },
                },
                thumb: {
                    borderRadius: "0",
                    bg: "white",
                    boxShadow: "none",
                    _checked: {
                        bg: "white",
                    },
                },
            },
        },
        size: {
            xs: {
                root: {
                    "--switch-width": "sizes.6",
                    "--switch-height": "sizes.3",
                    "--switch-indicator-font-size": "fontSizes.xs",
                },
            },
            sm: {
                root: {
                    "--switch-width": "sizes.8",
                    "--switch-height": "sizes.4",
                    "--switch-indicator-font-size": "fontSizes.xs",
                },
            },
            md: {
                root: {
                    "--switch-width": "sizes.10",
                    "--switch-height": "sizes.5",
                    "--switch-indicator-font-size": "fontSizes.sm",
                },
            },
            lg: {
                root: {
                    "--switch-width": "sizes.12",
                    "--switch-height": "sizes.6",
                    "--switch-indicator-font-size": "fontSizes.md",
                },
            },
        },
    },
    defaultVariants: {
        variant: "solid",
        size: "md",
    },
})

const statSlotRecipe = defineSlotRecipe({
    slots: statAnatomy.keys(),
    base: {
        root: {
            display: "flex",
            flexDirection: "column",
            gap: "1",
        },
        label: {
            color: "fg.muted",
            textStyle: "xs",
            fontWeight: "medium",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
        },
        valueText: {
            color: "fg.emphasized",
            fontWeight: "semibold",
        },
        valueUnit: {
            color: "fg.muted",
            fontWeight: "medium",
        },
        helpText: {
            color: "fg.subtle",
            textStyle: "xs",
        },
    },
})

const emptyStateSlotRecipe = defineSlotRecipe({
    slots: emptyStateAnatomy.keys(),
    base: {
        root: {
            color: "fg",
        },
        content: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3",
            textAlign: "center",
        },
        indicator: {
            color: "fg.subtle",
        },
        title: {
            color: "fg.emphasized",
            fontWeight: "semibold",
        },
        description: {
            color: "fg.muted",
            maxW: "lg",
        },
    },
})

const scrollAreaSlotRecipe = defineSlotRecipe({
    slots: scrollAreaAnatomy.keys(),
    base: {
        root: {
            borderRadius: "lg",
        },
        scrollbar: {
            display: "flex",
            userSelect: "none",
            touchAction: "none",
            p: "0.5",
            bg: "bg.subtle",
            transitionProperty: "background-color",
            transitionDuration: "fast",
            _hover: {
                bg: "bg.muted",
            },
            _vertical: {
                width: "3",
            },
            _horizontal: {
                flexDirection: "column",
                height: "3",
            },
        },
        thumb: {
            flex: "1",
            bg: "border.default",
            borderRadius: "lg",
            _hover: {
                bg: "border.emphasized",
            },
        },
        corner: {
            bg: "bg.subtle",
        },
    },
})

const cardSlotRecipe = defineSlotRecipe({
    slots: cardAnatomy.keys(),
    base: {
        root: {
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minWidth: "0",
            wordWrap: "break-word",
            borderRadius: "lg",
            borderWidth: "1px",
            borderColor: "border.subtle",
            bg: "bg.panel",
            color: "fg",
            boxShadow: "sm",
            textAlign: "start",
            overflow: "hidden",
            backgroundImage: "none",
        },
        title: {
            fontWeight: "semibold",
            letterSpacing: "-0.02em",
        },
        description: {
            color: "fg.muted",
            fontSize: "sm",
        },
        header: {
            paddingInline: "var(--card-padding)",
            paddingTop: "var(--card-padding)",
            paddingBottom: "calc(var(--card-padding) * 0.8)",
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
            borderBottomWidth: "1px",
            borderBottomColor: "border.muted",
            background: "transparent",
        },
        body: {
            padding: "var(--card-padding)",
            flex: "1",
            display: "flex",
            flexDirection: "column",
            gap: "4",
        },
        footer: {
            display: "flex",
            alignItems: "center",
            gap: "2",
            paddingInline: "var(--card-padding)",
            paddingBottom: "var(--card-padding)",
            paddingTop: "calc(var(--card-padding) * 0.8)",
            borderTopWidth: "1px",
            borderTopColor: "border.muted",
            background: "transparent",
        },
    },
    variants: {
        size: {
            sm: {
                root: { "--card-padding": "spacing.3" },
                title: { textStyle: "md" },
            },
            md: {
                root: { "--card-padding": "spacing.4" },
                title: { textStyle: "lg" },
            },
            lg: {
                root: { "--card-padding": "spacing.5" },
                title: { textStyle: "xl" },
            },
        },
        variant: {
            elevated: {
                root: {
                    bg: "bg.panel",
                    borderColor: "border.default",
                    boxShadow: "md",
                },
            },
            outline: {
                root: {
                    bg: "bg.panel",
                    borderColor: "border.subtle",
                    boxShadow: "sm",
                },
            },
            subtle: {
                root: {
                    bg: "bg.subtle",
                    boxShadow: "none",
                    borderColor: "transparent",
                    backgroundImage: "none",
                },
            },
        },
    },
    defaultVariants: {
        variant: "outline",
        size: "md",
    },
})

const dialogSlotRecipe = defineSlotRecipe({
    slots: dialogAnatomy.keys(),
    base: {
        backdrop: {
            bg: { _light: "rgba(15, 23, 42, 0.24)", _dark: "rgba(0, 0, 0, 0.52)" },
            backdropFilter: "blur(6px)",
            pos: "fixed",
            left: 0,
            top: 0,
            w: "100dvw",
            h: "100dvh",
            zIndex: "var(--z-index)",
            _open: { animationName: "fade-in", animationDuration: "slow" },
            _closed: { animationName: "fade-out", animationDuration: "moderate" },
        },
        positioner: {
            display: "flex",
            width: "100dvw",
            height: "100dvh",
            position: "fixed",
            left: 0,
            top: 0,
            "--dialog-z-index": "zIndex.modal",
            zIndex: "calc(var(--dialog-z-index) + var(--layer-index, 0))",
            justifyContent: "center",
            overscrollBehaviorY: "none",
        },
        content: {
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: "100%",
            outline: 0,
            borderRadius: "lg",
            borderWidth: "0",
            textStyle: "sm",
            my: "var(--dialog-margin, auto)",
            zIndex: "calc(var(--dialog-z-index) + var(--layer-index, 0))",
            bg: "bg.panel",
            boxShadow: "md",
            overflow: "hidden",
            backgroundImage: "none",
            _open: { animationDuration: "moderate" },
            _closed: { animationDuration: "faster" },
        },
        header: {
            display: "flex",
            gap: "2",
            flex: 0,
            px: "4",
            pt: "4",
            pb: "3",
            borderBottomWidth: "0",
            bg: {
                _light: "rgba(0, 0, 0, 0.015)",
                _dark: "rgba(255, 255, 255, 0.025)",
            },
        },
        body: {
            flex: "1",
            px: "4",
            py: "4",
        },
        footer: {
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "2",
            px: "4",
            pt: "3",
            pb: "4",
            borderTopWidth: "0",
            bg: {
                _light: "rgba(0, 0, 0, 0.02)",
                _dark: "rgba(255, 255, 255, 0.03)",
            },
        },
        title: {
            textStyle: "lg",
            fontWeight: "semibold",
        },
        description: {
            color: "fg.muted",
        },
        closeTrigger: {
            pos: "absolute",
            top: "2",
            insetEnd: "2",
            color: "fg.muted",
            borderRadius: "md",
            borderWidth: "0",
            _hover: {
                bg: "bg.emphasized",
                color: "fg",
            },
        },
    },
    variants: {
        placement: {
            center: {
                positioner: { alignItems: "center" },
                content: { mx: "auto" },
            },
            top: {
                positioner: { alignItems: "flex-start" },
                content: { mx: "auto", "--dialog-margin": "spacing.16" },
            },
            bottom: {
                positioner: { alignItems: "flex-end" },
                content: { mx: "auto", "--dialog-margin": "spacing.16" },
            },
        },
        scrollBehavior: {
            inside: {
                positioner: { overflow: "hidden" },
                content: { maxH: "calc(100% - 7.5rem)" },
                body: { overflow: "auto" },
            },
            outside: {
                positioner: { overflow: "auto", pointerEvents: "auto" },
            },
        },
        size: {
            xs: { content: { maxW: "sm" } },
            sm: { content: { maxW: "md" } },
            md: { content: { maxW: "lg" } },
            lg: { content: { maxW: "2xl" } },
            xl: { content: { maxW: "4xl" } },
            full: {
                content: {
                    maxW: "100dvw",
                    minH: "100dvh",
                    borderRadius: "0",
                    "--dialog-margin": "0",
                },
            },
        },
        motionPreset: {
            scale: {
                content: {
                    _open: { animationName: "scale-in, fade-in" },
                    _closed: { animationName: "scale-out, fade-out" },
                },
            },
            none: {},
        },
    },
    defaultVariants: {
        size: "md",
        scrollBehavior: "outside",
        placement: "center",
        motionPreset: "scale",
    },
})

const comboboxSlotRecipe = defineSlotRecipe({
    slots: comboboxAnatomy.keys(),
    base: {
        root: {
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
            width: "full",
        },
        control: {
            pos: "relative",
            "--padding-factor": "1",
            "--combobox-input-padding-end": "var(--combobox-input-padding-x)",
            "&:has([data-part=trigger]), &:has([data-part=clear-trigger])": {
                "--combobox-input-padding-end": "calc(var(--combobox-input-height) * var(--padding-factor))",
            },
            "&:has([data-part=trigger]):has([data-part=clear-trigger]:not([hidden]))": {
                "--padding-factor": "1.5",
            },
        },
        input: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "full",
            minH: "var(--combobox-input-height)",
            ps: "var(--combobox-input-padding-x)",
            pe: "var(--combobox-input-padding-end)",
            borderRadius: "md",
            outline: 0,
            userSelect: "none",
            textAlign: "start",
            _placeholderShown: {
                color: "fg.subtle",
            },
            _disabled: {
                layerStyle: "disabled",
            },
            "--focus-color": "colors.border.emphasized",
            "--error-color": "colors.red.500",
            _invalid: {
                boxShadow: "inset 0 -2px 0 0 var(--error-color)",
            },
        },
        trigger: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            "--input-height": "var(--combobox-input-height)",
        },
        clearTrigger: {
            color: "fg.muted",
            pointerEvents: "auto",
            focusVisibleRing: "inside",
            focusRingWidth: "2px",
            rounded: "md",
        },
        indicatorGroup: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1",
            pos: "absolute",
            insetEnd: "0",
            top: "0",
            bottom: "0",
            px: "var(--combobox-input-padding-x)",
            minW: "calc(var(--combobox-input-height) * 0.9)",
            _icon: {
                boxSize: "var(--combobox-indicator-size)",
            },
            "[data-disabled] &": {
                opacity: 0.5,
            },
        },
        content: {
            ...dropdownSurface,
            overflow: "hidden",
            _open: {
                animationStyle: "slide-fade-in",
                animationDuration: "fast",
            },
            _closed: {
                animationStyle: "slide-fade-out",
                animationDuration: "0s",
            },
            "&[data-empty]:not(:has([data-scope=combobox][data-part=empty]))": {
                opacity: 0,
            },
        },
        item: {
            position: "relative",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: "2",
            py: "var(--combobox-item-padding-y)",
            px: "var(--combobox-item-padding-x)",
            cursor: "option",
            justifyContent: "space-between",
            flex: "1",
            textAlign: "start",
            borderRadius: "0",
            _highlighted: {
                bg: "bg.emphasized",
            },
            _disabled: {
                pointerEvents: "none",
                opacity: "0.5",
            },
            _icon: {
                boxSize: "var(--combobox-indicator-size)",
            },
        },
        empty: {
            py: "var(--combobox-item-padding-y)",
            px: "var(--combobox-item-padding-x)",
        },
        itemText: {
            flex: "1",
        },
        itemGroup: {
            pb: "0",
        },
        itemGroupLabel: {
            fontWeight: "medium",
            py: "var(--combobox-item-padding-y)",
            px: "var(--combobox-item-padding-x)",
            color: "fg.muted",
        },
    },
    variants: {
        variant: {
            outline: {
                input: {
                    ...outlinedField,
                    _focusVisible: {
                        boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                    },
                },
            },
            subtle: {
                input: {
                    ...subtleField,
                    _focusVisible: {
                        boxShadow: "inset 0 -2px 0 0 var(--focus-color)",
                    },
                },
            },
            flushed: {
                input: {
                    bg: "transparent",
                    borderBottomWidth: "1px",
                    borderBottomColor: "border.default",
                    borderRadius: "0",
                    px: "0",
                    _focusVisible: {
                        boxShadow: "0px 2px 0px 0px var(--focus-color)",
                    },
                },
                indicatorGroup: {
                    px: "0",
                },
            },
        },
        size: {
            xs: {
                root: {
                    "--combobox-input-height": "sizes.8",
                    "--combobox-input-padding-x": "spacing.2",
                    "--combobox-indicator-size": "sizes.3.5",
                },
                input: {
                    textStyle: "xs",
                },
                content: {
                    "--combobox-item-padding-x": "spacing.1.5",
                    "--combobox-item-padding-y": "spacing.1",
                    "--combobox-indicator-size": "sizes.3.5",
                    p: "0",
                    textStyle: "xs",
                },
                trigger: {
                    textStyle: "xs",
                    gap: "1",
                },
            },
            sm: {
                root: {
                    "--combobox-input-height": "sizes.9",
                    "--combobox-input-padding-x": "spacing.2.5",
                    "--combobox-indicator-size": "sizes.4",
                },
                input: {
                    textStyle: "sm",
                },
                content: {
                    "--combobox-item-padding-x": "spacing.2",
                    "--combobox-item-padding-y": "spacing.1.5",
                    "--combobox-indicator-size": "sizes.4",
                    p: "0",
                    textStyle: "sm",
                },
                trigger: {
                    textStyle: "sm",
                    gap: "1",
                },
            },
            md: {
                root: {
                    "--combobox-input-height": "sizes.10",
                    "--combobox-input-padding-x": "spacing.3",
                    "--combobox-indicator-size": "sizes.4",
                },
                input: {
                    textStyle: "sm",
                },
                content: {
                    "--combobox-item-padding-x": "spacing.2",
                    "--combobox-item-padding-y": "spacing.1.5",
                    "--combobox-indicator-size": "sizes.4",
                    p: "0",
                    textStyle: "sm",
                },
                itemIndicator: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                },
                trigger: {
                    textStyle: "sm",
                    gap: "2",
                },
            },
            lg: {
                root: {
                    "--combobox-input-height": "sizes.11",
                    "--combobox-input-padding-x": "spacing.4",
                    "--combobox-indicator-size": "sizes.5",
                },
                input: {
                    textStyle: "md",
                },
                content: {
                    "--combobox-item-padding-x": "spacing.3",
                    "--combobox-item-padding-y": "spacing.2",
                    "--combobox-indicator-size": "sizes.5",
                    p: "0",
                    textStyle: "md",
                },
                trigger: {
                    textStyle: "md",
                    gap: "2",
                },
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "outline",
    },
})

const selectSlotRecipe = defineSlotRecipe({
    slots: selectAnatomy.keys(),
    base: {
        root: {
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
            width: "full",
        },
        control: {
            pos: "relative",
        },
        trigger: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "full",
            minH: "var(--select-trigger-height)",
            "--input-height": "var(--select-trigger-height)",
            px: "var(--select-trigger-padding-x)",
            borderRadius: "md",
            userSelect: "none",
            textAlign: "start",
            focusVisibleRing: "inside",
            _placeholderShown: { color: "fg.subtle" },
            _disabled: { layerStyle: "disabled", bg: "bg.subtle" },
            _invalid: { borderColor: "red.500" },
            _expanded: { bg: "bg.panel" },
        },
        indicatorGroup: {
            display: "flex",
            alignItems: "center",
            gap: "1",
            pos: "absolute",
            insetEnd: "0",
            top: "0",
            bottom: "0",
            px: "var(--select-trigger-padding-x)",
            minW: "calc(var(--select-trigger-height) * 0.9)",
            justifyContent: "center",
            pointerEvents: "none",
        },
        indicator: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: { base: "fg", _disabled: "fg.subtle" },
            opacity: 0.72,
        },
        content: {
            ...dropdownSurface,
            overflowY: "auto",
            _open: {
                animationStyle: "slide-fade-in",
                animationDuration: "fast",
            },
            _closed: {
                animationStyle: "slide-fade-out",
                animationDuration: "fastest",
            },
        },
        item: {
            position: "relative",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: "2",
            cursor: "option",
            justifyContent: "space-between",
            flex: "1",
            textAlign: "start",
            borderRadius: "md",
            _highlighted: { bg: "bg.emphasized" },
            _selected: { bg: "bg.subtle" },
            _disabled: { pointerEvents: "none", opacity: "0.5" },
            _icon: { width: "4", height: "4" },
        },
        itemText: { flex: "1" },
        itemGroup: { _first: { mt: "0" } },
        itemGroupLabel: {
            py: "1",
            px: "2",
            fontWeight: "medium",
            color: "fg.muted",
        },
        label: {
            fontWeight: "medium",
            userSelect: "none",
            textStyle: "sm",
            _disabled: { layerStyle: "disabled" },
        },
        valueText: {
            lineClamp: "1",
            maxW: "80%",
        },
        clearTrigger: {
            color: "fg.muted",
            pointerEvents: "auto",
            focusVisibleRing: "inside",
            focusRingWidth: "2px",
            rounded: "md",
        },
    },
    variants: {
        variant: {
            outline: {
                trigger: {
                    ...outlinedField,
                    _focusVisible: {
                        boxShadow: "inset 0 -2px 0 0 {colors.border.emphasized}",
                    },
                    _expanded: {
                        boxShadow: "inset 0 -2px 0 0 {colors.border.emphasized}",
                    },
                },
            },
            subtle: {
                trigger: {
                    ...subtleField,
                },
            },
        },
        size: {
            sm: {
                root: {
                    "--select-trigger-height": "sizes.8",
                    "--select-trigger-padding-x": "spacing.2.5",
                },
                content: { p: "0", textStyle: "sm" },
                trigger: { textStyle: "sm", gap: "1" },
                item: { py: "1", px: "1.5" },
            },
            md: {
                root: {
                    "--select-trigger-height": "sizes.9",
                    "--select-trigger-padding-x": "spacing.3",
                },
                content: { p: "0", textStyle: "sm" },
                itemGroup: { mt: "1.5" },
                item: { py: "1.5", px: "2" },
                itemIndicator: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                },
                trigger: { textStyle: "sm", gap: "2" },
            },
            lg: {
                root: {
                    "--select-trigger-height": "sizes.10",
                    "--select-trigger-padding-x": "spacing.4",
                },
                content: { p: "0", textStyle: "md" },
                itemGroup: { mt: "2" },
                item: { py: "2", px: "3" },
                trigger: { textStyle: "md", gap: "2" },
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "outline",
    },
})

const tableSlotRecipe = defineSlotRecipe({
    slots: tableAnatomy.keys(),
    base: {
        root: {
            fontVariantNumeric: "lining-nums tabular-nums",
            borderCollapse: "collapse",
            width: "full",
            textAlign: "start",
            verticalAlign: "top",
        },
        row: {
            _selected: { bg: "colorPalette.subtle" },
        },
        cell: {
            textAlign: "start",
            alignItems: "center",
            borderColor: "border.muted",
        },
        columnHeader: {
            fontWeight: "semibold",
            textAlign: "start",
            color: "fg",
            borderColor: "border.muted",
        },
        caption: {
            fontWeight: "medium",
            textStyle: "xs",
            color: "fg.muted",
        },
        footer: {
            fontWeight: "medium",
        },
    },
    variants: {
        interactive: {
            true: {
                body: {
                    "& tr": {
                        _hover: { bg: "bg.subtle" },
                    },
                },
            },
        },
        stickyHeader: {
            true: {
                header: {
                    "& :where(tr)": {
                        top: "var(--table-sticky-offset, 0)",
                        position: "sticky",
                        zIndex: 1,
                    },
                },
            },
        },
        striped: {
            true: {
                row: {
                    "&:nth-of-type(odd) td": { bg: "bg.subtle" },
                },
            },
        },
        showColumnBorder: {
            true: {
                columnHeader: {
                    "&:not(:last-of-type)": { borderInlineEndWidth: "1px" },
                },
                cell: {
                    "&:not(:last-of-type)": { borderInlineEndWidth: "1px" },
                },
            },
        },
        variant: {
            line: {
                columnHeader: {
                    borderBottomWidth: "1px",
                    bg: "bg.muted",
                },
                cell: { borderBottomWidth: "1px" },
                row: { bg: "bg" },
            },
            outline: {
                root: {
                    boxShadow: "0 0 0 1px {colors.border.default}",
                    borderRadius: "lg",
                    overflow: "hidden",
                },
                header: { bg: "bg.muted" },
                columnHeader: { borderBottomWidth: "1px" },
                row: {
                    "&:not(:last-of-type)": { borderBottomWidth: "1px" },
                },
                footer: { borderTopWidth: "1px" },
            },
        },
        size: {
            sm: {
                root: { textStyle: "sm" },
                columnHeader: { px: "2", py: "2" },
                cell: { px: "2", py: "2" },
            },
            md: {
                root: { textStyle: "sm" },
                columnHeader: { px: "3", py: "3" },
                cell: { px: "3", py: "3" },
            },
            lg: {
                root: { textStyle: "md" },
                columnHeader: { px: "4", py: "3" },
                cell: { px: "4", py: "3" },
            },
        },
    },
    defaultVariants: {
        variant: "line",
        size: "md",
    },
})

const tabsSlotRecipe = defineSlotRecipe({
    slots: tabsAnatomy.keys(),
    base: {
        root: {
            "--tabs-trigger-radius": "radii.md",
            "--tabs-indicator-shadow": "shadows.xs",
            "--tabs-indicator-bg": "transparent",
            position: "relative",
            _horizontal: { display: "block" },
            _vertical: { display: "flex" },
        },
        list: {
            display: "inline-flex",
            position: "relative",
            isolation: "isolate",
            minH: "var(--tabs-height)",
            _horizontal: { flexDirection: "row" },
            _vertical: { flexDirection: "column" },
            bg: "bg.default",
        },
        trigger: {
            outline: "0",
            minW: "var(--tabs-height)",
            height: "var(--tabs-height)",
            display: "flex",
            alignItems: "center",
            fontWeight: "medium",
            position: "relative",
            cursor: "button",
            gap: "2",
            borderRadius: "md",
            color: "fg.muted",
            userSelect: "none",
            _focusVisible: {
                zIndex: 1,
                outline: "2px solid",
                outlineColor: "border.emphasized",
                outlineOffset: "2px",
            },
            _disabled: {
                cursor: "not-allowed",
                opacity: 0.5,
            },
            _icon: {
                fontSize: "1rem",
                opacity: 0.9,
            },
        },
        content: {
            focusVisibleRing: "inside",
            _horizontal: {
                width: "100%",
                pt: "var(--tabs-content-padding)",
            },
            _vertical: {
                height: "100%",
                ps: "var(--tabs-content-padding)",
            },
        },
        indicator: {
            width: "var(--width)",
            height: "var(--height)",
            borderRadius: "var(--tabs-trigger-radius)",
            bg: "var(--tabs-indicator-bg)",
            shadow: "var(--tabs-indicator-shadow)",
            zIndex: -1,
        },
    },
    variants: {
        fitted: {
            true: {
                list: { display: "flex" },
                trigger: {
                    flex: 1,
                    textAlign: "center",
                    justifyContent: "center",
                },
            },
        },
        justify: {
            start: { list: { justifyContent: "flex-start" } },
            center: { list: { justifyContent: "center" } },
            end: { list: { justifyContent: "flex-end" } },
        },
        size: {
            sm: {
                root: {
                    "--tabs-height": "sizes.8",
                    "--tabs-content-padding": "spacing.3",
                },
                trigger: { py: "1", px: "3", textStyle: "sm" },
            },
            md: {
                root: {
                    "--tabs-height": "sizes.9",
                    "--tabs-content-padding": "spacing.4",
                },
                trigger: { py: "2", px: "4", textStyle: "sm" },
            },
            lg: {
                root: {
                    "--tabs-height": "sizes.10",
                    "--tabs-content-padding": "spacing.4.5",
                },
                trigger: { py: "2", px: "4.5", textStyle: "md" },
            },
        },
        variant: {
            line: {
                list: {
                    display: "flex",
                    borderColor: "border.default",
                    _horizontal: { borderBottomWidth: "1px" },
                    _vertical: { borderEndWidth: "1px" },
                },
                trigger: {
                    color: "fg.muted",
                    borderRadius: "0",
                    _selected: {
                        color: "fg",
                        _horizontal: {
                            layerStyle: "indicator.bottom",
                            "--indicator-offset-y": "-1px",
                            "--indicator-color": "colors.border.emphasized",
                        },
                        _vertical: {
                            layerStyle: "indicator.end",
                            "--indicator-offset-x": "-1px",
                            "--indicator-color": "colors.border.emphasized",
                        },
                    },
                },
            },
            subtle: {
                trigger: {
                    color: "fg.muted",
                    _selected: {
                        bg: "bg.subtle",
                        color: "fg",
                    },
                },
            },
            enclosed: {
                list: {
                    p: "2",
                    gap: "1",
                    borderRadius: "lg",
                    borderWidth: "1px",
                    borderColor: "border.subtle",
                    minH: "calc(var(--tabs-height) - 4px)",
                    boxShadow: "sm",
                },
                trigger: {
                    justifyContent: "flex-start",
                    color: "fg.muted",
                    borderWidth: "0",
                    px: "4",
                    fontWeight: "semibold",
                    letterSpacing: "-0.01em",
                    _hover: {
                        bg: "bg.subtle",
                        color: "fg",
                    },
                    _selected: {
                        bg: "bg.panel",
                        color: "fg",
                        shadow: "sm",
                        _horizontal: {
                            boxShadow: "inset 0 -2px 0 0 {colors.border.emphasized}",
                        },
                        _vertical: {
                            borderInlineStartWidth: "3px",
                            borderInlineStartColor: "border.emphasized",
                            boxShadow: "inset 0 0 0 1px {colors.border.subtle}, 0 8px 18px rgba(9, 9, 11, 0.08)",
                        },
                    },
                },
            },
            outline: {
                list: {
                    "--line-thickness": "1px",
                    "--line-offset": "calc(var(--line-thickness) * -1)",
                    borderColor: "border.default",
                    display: "flex",
                    _horizontal: {
                        _before: {
                            content: '\"\"',
                            position: "absolute",
                            bottom: "0px",
                            width: "100%",
                            borderBottomWidth: "var(--line-thickness)",
                            borderBottomColor: "border.default",
                        },
                    },
                    _vertical: {
                        _before: {
                            content: '\"\"',
                            position: "absolute",
                            insetInline: "var(--line-offset)",
                            height: "calc(100% - calc(var(--line-thickness) * 2))",
                            borderEndWidth: "var(--line-thickness)",
                            borderEndColor: "border.default",
                        },
                    },
                },
                trigger: {
                    color: "fg.muted",
                    borderWidth: "1px",
                    borderColor: "transparent",
                    _selected: {
                        bg: "bg",
                        color: "fg",
                    },
                    _horizontal: {
                        marginBottom: "var(--line-offset)",
                        marginEnd: { _notLast: "var(--line-offset)" },
                        _selected: {
                            borderColor: "border.default",
                            borderBottomColor: "transparent",
                        },
                    },
                    _vertical: {
                        marginEnd: "var(--line-offset)",
                        marginBottom: { _notLast: "var(--line-offset)" },
                        _selected: {
                            borderColor: "border.default",
                            borderEndColor: "transparent",
                        },
                    },
                },
            },
        },
    },
    defaultVariants: {
        size: "md",
        variant: "line",
    },
})

const segmentGroupSlotRecipe = defineSlotRecipe({
    slots: segmentGroupAnatomy.keys(),
    base: {
        root: {
            "--segment-radius": "radii.md",
            "--segment-indicator-bg": { _light: "colors.bg", _dark: "colors.bg.panel" },
            "--segment-indicator-shadow": "none",
            borderRadius: "var(--segment-radius)",
            display: "inline-flex",
            minW: "max-content",
            textAlign: "center",
            position: "relative",
            isolation: "isolate",
            bg: "bg.muted",
            borderWidth: "1px",
            borderColor: "border.subtle",
            overflow: "hidden",
            _vertical: { flexDirection: "column" },
        },
        item: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            fontSize: "sm",
            position: "relative",
            color: "fg",
            borderRadius: "var(--segment-radius)",
            _disabled: { opacity: "0.5" },
            "&:has(input:focus-visible)": { focusRing: "outside" },
            _before: {
                content: '\"\"',
                position: "absolute",
                bg: "border.subtle",
                transition: "opacity 0.2s",
            },
            _horizontal: {
                _before: {
                    insetInlineStart: 0,
                    insetBlock: "1.5",
                    width: "1px",
                },
            },
            _vertical: {
                _before: {
                    insetBlockStart: 0,
                    insetInline: "1.5",
                    height: "1px",
                },
            },
            "& + &[data-state=checked], &[data-state=checked] + &, &:first-of-type": {
                _before: { opacity: "0" },
            },
            "&[data-state=checked][data-ssr]": {
                shadow: "none",
                bg: "bg",
                borderRadius: "var(--segment-radius)",
                boxShadow: "inset 0 0 0 1px {colors.border.default}",
            },
        },
        indicator: {
            shadow: "var(--segment-indicator-shadow)",
            pos: "absolute",
            bg: "var(--segment-indicator-bg)",
            width: "var(--width)",
            height: "var(--height)",
            top: "var(--top)",
            left: "var(--left)",
            zIndex: -1,
            borderRadius: "var(--segment-radius)",
            boxShadow: "inset 0 0 0 1px {colors.border.default}",
        },
    },
    variants: {
        size: {
            sm: {
                item: { textStyle: "sm", px: "3.5", gap: "2", height: "8" },
            },
            md: {
                item: { textStyle: "sm", px: "4", gap: "2", height: "9" },
            },
            lg: {
                item: { textStyle: "md", px: "4.5", gap: "3", height: "10" },
            },
        },
    },
    defaultVariants: {
        size: "md",
    },
})

export const Metro = {
    globalCss: {
        body: {
            bg: "bg.default",
            color: "fg.default",
            backgroundImage: "none",
            backgroundAttachment: "fixed",
        },
        "*::selection": {
            bg: colorPair("rgba(14, 116, 144, 0.20)", "rgba(56, 189, 248, 0.28)"),
        },
    },
    tokens: {
        colors: {
            blue: {
                50: { value: "#F1F8FE" },
                100: { value: "#D9ECFB" },
                200: { value: "#B6DBF5" },
                300: { value: "#7FBFEA" },
                400: { value: "#56A9E8" },
                500: { value: "#0F6CBD" },
                600: { value: "#0B5DA4" },
                700: { value: "#0A4B83" },
                800: { value: "#0B3A63" },
                900: { value: "#0D2E4F" },
                950: { value: "#081D33" },
            },
            gray: {
                50: { value: "#fbfbfb" },
                100: { value: "#fbfbfb" },
                200: { value: "#f3f3f3" },
                300: { value: "#ececec" },
                400: { value: "#ececec" },
                500: { value: "#3f3f3f" },
                600: { value: "#3f3f3f" },
                700: { value: "#3f3f3f" },
                800: { value: "#2e2e2e" },
                900: { value: "#1d1d1d" },
                950: { value: "#1d1d1d" },
            },
        },
        radii: {
            xs: { value: "0px" },
            sm: { value: "0px" },
            md: { value: "0px" },
            lg: { value: "0px" },
            xl: { value: "0px" },
            "2xl": { value: "0px" },
            l2: { value: "0px" },
            l3: { value: "0px" },
        },
        shadows: {
            xs: { value: "0 1px 1px rgba(24, 24, 27, 0.08)" },
            sm: { value: "0 1px 2px rgba(24, 24, 27, 0.10)" },
            md: { value: "0 8px 18px rgba(9, 9, 11, 0.18)" },
            lg: { value: "0 16px 36px rgba(9, 9, 11, 0.24)" },
        },
    },
    semanticTokens: {
        colors: {
            bg: {
                DEFAULT: surfaceDefault,
                default: surfaceDefault,
                subtle: surfaceSubtle,
                muted: surfaceSubtle,
                panel: surfacePanel,
                emphasized: surfaceEmphasized,
            },
            fg: {
                DEFAULT: textDefault,
                default: textDefault,
                muted: textMuted,
                subtle: textSubtle,
                emphasized: textEmphasized,
            },
            border: {
                DEFAULT: borderDefault,
                default: borderDefault,
                muted: borderMuted,
                subtle: borderSubtle,
                emphasized: borderEmphasized,
            },
            gray: {
                subtle: borderMuted,
                muted: surfaceEmphasized,
                emphasized: grayEmphasized,
                solid: graySolid,
                contrast: borderSubtle,
                fg: textDefault,
                focusRing: borderEmphasized,
                border: borderDefault,
            },
            app: {
                error: {
                    bg: semanticColor("#FEE2E2", "#3B1014"),
                    border: semanticColor("#FCA5A5", "#7F1D1D"),
                    title: semanticColor("#991B1B", "#FCA5A5"),
                    fg: semanticColor("#B91C1C", "#FECACA"),
                },
                endpoint: {
                    peer: {
                        bg: { value: { _light: "{colors.cyan.50}", _dark: "{colors.cyan.950}" } },
                        border: { value: { _light: "{colors.cyan.200}", _dark: "{colors.cyan.800}" } },
                        fg: { value: { _light: "{colors.cyan.700}", _dark: "{colors.cyan.300}" } },
                    },
                    client: {
                        bg: { value: { _light: "{colors.sky.50}", _dark: "{colors.sky.950}" } },
                        border: { value: { _light: "{colors.sky.200}", _dark: "{colors.sky.800}" } },
                        fg: { value: { _light: "{colors.sky.700}", _dark: "{colors.sky.300}" } },
                    },
                },
            },
        },
    },
    recipes: {
        badge: badgeRecipe,
        button: buttonRecipe,
        code: codeRecipe,
        input: inputRecipe,
        textarea: textareaRecipe,
    },
    slotRecipes: {
        card: cardSlotRecipe,
        combobox: comboboxSlotRecipe,
        checkbox: checkboxSlotRecipe,
        dialog: dialogSlotRecipe,
        emptyState: emptyStateSlotRecipe,
        field: fieldSlotRecipe,
        scrollArea: scrollAreaSlotRecipe,
        segmentGroup: segmentGroupSlotRecipe,
        select: selectSlotRecipe,
        stat: statSlotRecipe,
        switch: switchSlotRecipe,
        table: tableSlotRecipe,
        tabs: tabsSlotRecipe,
    },
} as const