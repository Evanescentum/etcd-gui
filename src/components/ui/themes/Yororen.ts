import { defineRecipe, defineSlotRecipe } from "@chakra-ui/react"
import {
    cardAnatomy,
    dialogAnatomy,
    segmentGroupAnatomy,
    selectAnatomy,
    tableAnatomy,
    tabsAnatomy,
} from "@chakra-ui/react/anatomy"

const buttonRecipe = defineRecipe({
    base: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        appearance: "none",
        userSelect: "none",
        position: "relative",
        verticalAlign: "middle",
        borderRadius: "md",
        borderWidth: "1px",
        borderColor: "transparent",
        cursor: "button",
        flexShrink: "0",
        outline: "0",
        lineHeight: "1.2",
        isolation: "isolate",
        whiteSpace: "nowrap",
        fontWeight: "medium",
        transitionProperty: "common",
        transitionDuration: "moderate",
        focusVisibleRing: "outside",
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
                boxShadow: "none",
                _hover: {
                    bg: "colorPalette.solid/90",
                },
                _expanded: {
                    bg: "colorPalette.solid/90",
                },
            },
            subtle: {
                bg: "colorPalette.subtle",
                color: "colorPalette.fg",
                boxShadow: "none",
                _hover: {
                    bg: "colorPalette.muted",
                },
                _expanded: {
                    bg: "colorPalette.muted",
                },
            },
            outline: {
                borderColor: "colorPalette.border",
                bg: "bg",
                color: "colorPalette.fg",
                _hover: {
                    bg: "bg.subtle",
                },
                _expanded: {
                    bg: "bg.subtle",
                },
            },
            ghost: {
                color: "colorPalette.fg",
                bg: "transparent",
                _hover: {
                    bg: "colorPalette.subtle",
                },
                _expanded: {
                    bg: "colorPalette.subtle",
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
        bg: "bg",
        _disabled: {
            layerStyle: "disabled",
            bg: "bg.subtle",
        },
        height: "var(--input-height)",
        minW: "var(--input-height)",
        "--focus-color": "colors.border.emphasized",
        "--error-color": "colors.red.400",
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
                borderWidth: "1px",
                borderColor: "border.default",
                bg: "bg",
                focusVisibleRing: "inside",
                focusRingColor: "var(--focus-color)",
            },
            subtle: {
                borderWidth: "1px",
                borderColor: "border.muted",
                bg: "bg.subtle",
                focusVisibleRing: "inside",
                focusRingColor: "var(--focus-color)",
            },
            flushed: {
                bg: "transparent",
                borderBottomWidth: "1px",
                borderBottomColor: "border.default",
                borderRadius: "0",
                px: "0",
                _focusVisible: {
                    borderColor: "var(--focus-color)",
                    boxShadow: "0px 1px 0px 0px var(--focus-color)",
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
        bg: "bg",
        _disabled: {
            layerStyle: "disabled",
            bg: "bg.subtle",
        },
        "--focus-color": "colors.border.emphasized",
        "--error-color": "colors.red.400",
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
                borderWidth: "1px",
                borderColor: "border.default",
                bg: "bg",
                focusVisibleRing: "inside",
                focusRingColor: "var(--focus-color)",
            },
            subtle: {
                borderWidth: "1px",
                borderColor: "border.muted",
                bg: "bg.subtle",
                focusVisibleRing: "inside",
                focusRingColor: "var(--focus-color)",
            },
            flushed: {
                bg: "transparent",
                borderBottomWidth: "1px",
                borderBottomColor: "border.default",
                borderRadius: "0",
                px: "0",
                _focusVisible: {
                    borderColor: "var(--focus-color)",
                    boxShadow: "0px 1px 0px 0px var(--focus-color)",
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
        borderRadius: "full",
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
        borderWidth: "1px",
        borderColor: "border.muted",
    },
    variants: badgeRecipe.variants,
    defaultVariants: badgeRecipe.defaultVariants,
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
            borderColor: "border.default",
            bg: "bg.panel",
            color: "fg",
            boxShadow: "sm",
            textAlign: "start",
        },
        title: {
            fontWeight: "semibold",
        },
        description: {
            color: "fg.muted",
            fontSize: "sm",
        },
        header: {
            paddingInline: "var(--card-padding)",
            paddingTop: "var(--card-padding)",
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
        },
        body: {
            padding: "var(--card-padding)",
            flex: "1",
            display: "flex",
            flexDirection: "column",
        },
        footer: {
            display: "flex",
            alignItems: "center",
            gap: "2",
            paddingInline: "var(--card-padding)",
            paddingBottom: "var(--card-padding)",
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
                    borderColor: "border.default",
                    boxShadow: "none",
                },
            },
            subtle: {
                root: {
                    bg: "bg.subtle",
                    borderColor: "border.muted",
                    boxShadow: "none",
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
            bg: "blackAlpha.400",
            pos: "fixed",
            left: 0,
            top: 0,
            w: "100dvw",
            h: "100dvh",
            zIndex: "var(--z-index)",
            backdropFilter: "blur(2px)",
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
            borderWidth: "1px",
            borderColor: "border.default",
            textStyle: "sm",
            my: "var(--dialog-margin, auto)",
            zIndex: "calc(var(--dialog-z-index) + var(--layer-index, 0))",
            bg: "bg.panel",
            boxShadow: "lg",
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
            borderBottomWidth: "1px",
            borderBottomColor: "border.muted",
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
            borderTopWidth: "1px",
            borderTopColor: "border.muted",
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
            _hover: {
                bg: "bg.subtle",
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
            _invalid: { borderColor: "red.400" },
            _expanded: { bg: "bg.subtle" },
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
            pointerEvents: "none",
        },
        indicator: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: { base: "fg.muted", _disabled: "fg.subtle" },
        },
        content: {
            background: "bg.panel",
            display: "flex",
            flexDirection: "column",
            zIndex: "dropdown",
            borderRadius: "lg",
            borderWidth: "1px",
            borderColor: "border.default",
            outline: 0,
            maxH: "96",
            overflowY: "auto",
            boxShadow: "md",
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
                    bg: "bg",
                    borderWidth: "1px",
                    borderColor: "border.default",
                    _expanded: { borderColor: "border.emphasized" },
                },
            },
            subtle: {
                trigger: {
                    borderWidth: "1px",
                    borderColor: "border.muted",
                    bg: "bg.subtle",
                },
            },
        },
        size: {
            sm: {
                root: {
                    "--select-trigger-height": "sizes.8",
                    "--select-trigger-padding-x": "spacing.2.5",
                },
                content: { p: "1", textStyle: "sm" },
                trigger: { textStyle: "sm", gap: "1" },
                item: { py: "1", px: "1.5" },
            },
            md: {
                root: {
                    "--select-trigger-height": "sizes.9",
                    "--select-trigger-padding-x": "spacing.3",
                },
                content: { p: "1", textStyle: "sm" },
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
                content: { p: "1.5", textStyle: "md" },
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
            fontWeight: "medium",
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
                columnHeader: { borderBottomWidth: "1px" },
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
            "--tabs-indicator-bg": "colors.bg",
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
            borderRadius: "var(--tabs-trigger-radius)",
            _focusVisible: {
                zIndex: 1,
                outline: "2px solid",
                outlineColor: "border.emphasized",
            },
            _disabled: {
                cursor: "not-allowed",
                opacity: 0.5,
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
                    bg: "bg.muted",
                    p: "1",
                    borderRadius: "lg",
                    borderWidth: "1px",
                    borderColor: "border.muted",
                    minH: "calc(var(--tabs-height) - 4px)",
                },
                trigger: {
                    justifyContent: "center",
                    color: "fg.muted",
                    _selected: {
                        bg: "bg",
                        color: "fg",
                        shadow: "xs",
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
                            content: '""',
                            position: "absolute",
                            bottom: "0px",
                            width: "100%",
                            borderBottomWidth: "var(--line-thickness)",
                            borderBottomColor: "border.default",
                        },
                    },
                    _vertical: {
                        _before: {
                            content: '""',
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
            "--segment-indicator-bg": { _light: "colors.bg", _dark: "colors.bg.emphasized" },
            "--segment-indicator-shadow": "shadows.xs",
            borderRadius: "var(--segment-radius)",
            display: "inline-flex",
            minW: "max-content",
            textAlign: "center",
            position: "relative",
            isolation: "isolate",
            bg: "bg.muted",
            borderWidth: "1px",
            borderColor: "border.muted",
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
                content: '""',
                position: "absolute",
                bg: "border.muted",
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
                shadow: "xs",
                bg: "bg",
                borderRadius: "var(--segment-radius)",
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

export const Yororen = {
    globalCss: {
        "*::selection": {
            bg: { _light: "rgba(47, 99, 255, 0.25)", _dark: "rgba(139, 176, 255, 0.25)" },
        },
    },
    tokens: {
        colors: {
            gray: {
                50: { value: "#F4F4F6" },
                100: { value: "#EFEFF2" },
                200: { value: "#E3E3E8" },
                300: { value: "#D8D8DD" },
                400: { value: "#9A9AA2" },
                500: { value: "#6B6B73" },
                600: { value: "#3E3E45" },
                700: { value: "#2A2A2F" },
                800: { value: "#1D1D21" },
                900: { value: "#151518" },
                950: { value: "#0F0F11" },
            },
        },
        radii: {
            md: { value: "0.375rem" },
            lg: { value: "0.5rem" },
            l2: { value: "0.375rem" },
            l3: { value: "0.5rem" },
        },
        shadows: {
            xs: { value: "0 1px 2px rgba(11, 11, 13, 0.08)" },
            sm: { value: "0 1px 2px rgba(11, 11, 13, 0.12)" },
            md: { value: "0 4px 12px rgba(11, 11, 13, 0.18)" },
            lg: { value: "0 12px 28px rgba(11, 11, 13, 0.24)" },
        },
    },
    semanticTokens: {
        colors: {
            bg: {
                DEFAULT: { value: { _light: "#FFFFFF", _dark: "#151518" } },
                default: { value: { _light: "#FFFFFF", _dark: "#151518" } },
                subtle: { value: { _light: "#EFEFF2", _dark: "#111113" } },
                muted: { value: { _light: "#F1F1F3", _dark: "#1D1D21" } },
                panel: { value: { _light: "#FBFBFD", _dark: "#1D1D21" } },
                emphasized: { value: { _light: "#E6E6EA", _dark: "#232327" } },
            },
            fg: {
                DEFAULT: { value: { _light: "#141416", _dark: "#F2F2F3" } },
                default: { value: { _light: "#141416", _dark: "#F2F2F3" } },
                muted: { value: { _light: "#3E3E45", _dark: "#C8C8CC" } },
                subtle: { value: { _light: "#6B6B73", _dark: "#9B9BA1" } },
                emphasized: { value: { _light: "#141416", _dark: "#F2F2F3" } },
            },
            border: {
                DEFAULT: { value: { _light: "#D8D8DD", _dark: "#2A2A2F" } },
                default: { value: { _light: "#D8D8DD", _dark: "#2A2A2F" } },
                muted: { value: { _light: "#E3E3E8", _dark: "#1E1E22" } },
                subtle: { value: { _light: "#E3E3E8", _dark: "#1E1E22" } },
                emphasized: { value: { _light: "#2F63FF", _dark: "#8BB0FF" } },
            },
            gray: {
                subtle: { value: { _light: "#EFEFF2", _dark: "#1D1D21" } },
                muted: { value: { _light: "#E3E3E8", _dark: "#2A2A2F" } },
                emphasized: { value: { _light: "#0C0C0D", _dark: "#FFFFFF" } },
                solid: { value: { _light: "#121214", _dark: "#F4F4F6" } },
                contrast: { value: { _light: "#FFFFFF", _dark: "#0B0B0D" } },
                fg: { value: { _light: "#141416", _dark: "#F2F2F3" } },
                focusRing: { value: { _light: "#2F63FF", _dark: "#8BB0FF" } },
                border: { value: { _light: "#D8D8DD", _dark: "#2A2A2F" } },
            },
            app: {
                error: {
                    bg: { value: { _light: "#FFB4AE", _dark: "#FFB4AE" } },
                    border: { value: { _light: "#FFA099", _dark: "#FF8A82" } },
                    title: { value: { _light: "#0B0B0D", _dark: "#0B0B0D" } },
                    fg: { value: { _light: "#0B0B0D", _dark: "#0B0B0D" } },
                },
                endpoint: {
                    peer: {
                        bg: { value: { _light: "{colors.purple.50}", _dark: "{colors.purple.950}" } },
                        border: { value: { _light: "{colors.purple.200}", _dark: "{colors.purple.800}" } },
                        fg: { value: { _light: "{colors.purple.700}", _dark: "{colors.purple.300}" } },
                    },
                    client: {
                        bg: { value: { _light: "{colors.blue.50}", _dark: "{colors.blue.950}" } },
                        border: { value: { _light: "{colors.blue.200}", _dark: "{colors.blue.800}" } },
                        fg: { value: { _light: "{colors.blue.700}", _dark: "{colors.blue.300}" } },
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
        dialog: dialogSlotRecipe,
        segmentGroup: segmentGroupSlotRecipe,
        select: selectSlotRecipe,
        table: tableSlotRecipe,
        tabs: tabsSlotRecipe,
    },
} as const