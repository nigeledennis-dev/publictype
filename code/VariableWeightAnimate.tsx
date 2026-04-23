import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * WEIGHT HERO
 *
 * Single-slug variable-font hero. Display text scales to the
 * container's HEIGHT (like Specimen — fontSize set imperatively
 * each layout tick) while the chosen axis (default wght) oscillates
 * end-to-end between its min and max with a sinusoidal ease —
 * smooth at the extremes, never pausing mid-travel. Includes a
 * pause button and a TypeTester-style OT Features dropdown for
 * manually toggling supported OpenType features.
 *
 * Slug resolution: if the slug names a specific child, that child's
 * variable face is used; if it names a super-family (or standalone),
 * the first variable face found inside is used. @font-face rules for
 * every variable face in the super are injected either way so other
 * instances on the same page get their fonts too.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 900
 */

function slugToTitle(slug: string): string {
    if (!slug) return ""
    return slug
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
}

function parseColor(c: string): [number, number, number] | null {
    if (!c) return null
    const s = c.trim()
    if (s.startsWith("#")) {
        let hex = s.slice(1)
        if (hex.length === 3)
            hex = hex
                .split("")
                .map((x) => x + x)
                .join("")
        if (hex.length >= 6) {
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16),
            ]
        }
    }
    const m = s.match(/rgba?\(([^)]+)\)/i)
    if (m) {
        const parts = m[1].split(",").map((p) => parseFloat(p.trim()))
        if (parts.length >= 3) return [parts[0], parts[1], parts[2]]
    }
    return null
}

function getContrastText(bg: string): string {
    const rgb = parseColor(bg)
    if (!rgb) return "#000000"
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return lum > 0.179 ? "#000000" : "#FFFFFF"
}

const DEFAULT_FEATURES = new Set([
    "liga",
    "kern",
    "calt",
    "ccmp",
    "rlig",
    "mark",
    "mkmk",
])

const FEATURE_NAMES: Record<string, string> = {
    aalt: "Access All Alternates",
    case: "Case-Sensitive Forms",
    frac: "Fractions",
    lnum: "Lining Figures",
    onum: "Oldstyle Figures",
    ordn: "Ordinals",
    pnum: "Proportional Figures",
    tnum: "Tabular Figures",
    sups: "Superscript",
    subs: "Subscript",
    smcp: "Small Caps",
    c2sc: "Caps to Small Caps",
    dlig: "Discretionary Ligatures",
    sinf: "Scientific Inferiors",
    fwid: "Full Width",
    hwid: "Half Width",
    numr: "Numerators",
    dnom: "Denominators",
}

type VarAxis = {
    axis: string
    name: string
    minValue: number
    maxValue: number
}

type VariableStyle = {
    fullFamily: string
    ownerSlug: string
    ownerName: string
    variableAxes: VarAxis[]
    stylisticSetNames: Array<{ featureName: string; humanName: string }>
    supportedFeatures: string[]
}

type Props = {
    familySlug: string
    displayText: string
    axisTag: string
    cycleSeconds: number
    showControls: boolean
    padding: number
    controlsGap: number
    foreground: string
    displayColor: string
    background: string
    accent: string
    accentForeground: string
    fontdueUrl: string
}

export default function WeightHero(props: Props) {
    const {
        familySlug,
        displayText,
        axisTag,
        cycleSeconds,
        showControls,
        padding,
        controlsGap,
        foreground,
        displayColor,
        background,
        accent,
        accentForeground,
        fontdueUrl,
    } = props

    const slug = (familySlug || "").trim().toLowerCase()

    const [collectionName, setCollectionName] = React.useState("")
    const [resolvedSlugs, setResolvedSlugs] = React.useState<string[]>([])
    const [variant, setVariant] = React.useState<VariableStyle | null>(null)
    const [fontsLoaded, setFontsLoaded] = React.useState(false)

    const resolvedFamily = variant?.fullFamily || ""
    const axes = variant?.variableAxes || []

    const toggleable = React.useMemo<{ tag: string; label: string }[]>(() => {
        if (!variant) return []
        const ssMap = new Map(
            variant.stylisticSetNames.map((s) => [s.featureName, s.humanName])
        )
        return variant.supportedFeatures
            .filter((f) => !DEFAULT_FEATURES.has(f))
            .map((tag) => ({
                tag,
                label:
                    ssMap.get(tag) || FEATURE_NAMES[tag] || tag.toUpperCase(),
            }))
    }, [variant])

    const [activeFeatures, setActiveFeatures] = React.useState<Set<string>>(
        new Set()
    )
    const [otOpen, setOtOpen] = React.useState(false)

    // Drop active features that aren't supported by the current variant.
    React.useEffect(() => {
        setActiveFeatures((prev) => {
            const supported = new Set(toggleable.map((t) => t.tag))
            let changed = false
            const next = new Set<string>()
            for (const f of prev) {
                if (supported.has(f)) next.add(f)
                else changed = true
            }
            return changed ? next : prev
        })
    }, [toggleable])

    const fontFeatureSettings = React.useMemo(() => {
        if (activeFeatures.size === 0) return "normal"
        return Array.from(activeFeatures)
            .map((t) => `'${t}' 1`)
            .join(", ")
    }, [activeFeatures])

    const activeAxis = React.useMemo<VarAxis | null>(() => {
        if (axes.length === 0) return null
        const wanted = (axisTag || "").trim().toLowerCase()
        if (wanted) {
            const exact = axes.find((a) => a.axis.toLowerCase() === wanted)
            if (exact) return exact
        }
        return axes.find((a) => a.axis.toLowerCase() === "wght") || axes[0]
    }, [axes, axisTag])

    const [axisValue, setAxisValue] = React.useState(0)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = React.useRef(paused)
    React.useEffect(() => {
        pausedRef.current = paused
    }, [paused])

    const rootRef = React.useRef<HTMLDivElement>(null)
    const displayRef = React.useRef<HTMLDivElement>(null)
    const textRef = React.useRef<HTMLDivElement>(null)

    // Fetch Fontdue metadata + inject @font-face. Walker tracks each
    // variable face's ownerSlug so we can prefer the one matching the
    // user's target slug — without this, multiple WeightHeros pointing
    // at different children all render the same face.
    React.useEffect(() => {
        if (!slug) return
        let cancelled = false
        const query = `{
  viewer {
    fontCollections(first: 100) {
      edges {
        node {
          name
          slug { name }
          collectionType
          cssUrl
          parent { slug { name } }
          fontStyles {
            name
            cssFamily
            webfontSources { format url }
            variableAxes { axis name minValue maxValue }
            fontFeatures {
              supportedFeatures
              stylisticSetNames { featureName humanName }
            }
          }
          children {
            name
            cssUrl
            slug { name }
            fontStyles {
              name
              cssFamily
              webfontSources { format url }
              variableAxes { axis name minValue maxValue }
              fontFeatures {
                supportedFeatures
                stylisticSetNames { featureName humanName }
              }
            }
          }
        }
      }
    }
  }
}`
        fetch(`${fontdueUrl}/graphql`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return
                const edges = data?.data?.viewer?.fontCollections?.edges || []
                if (edges.length === 0) {
                    setFontsLoaded(true)
                    return
                }
                const nodes: any[] = edges.map((e: any) => e.node)

                // Resolve the user's slug to a super-family node.
                // Three-step lookup: super, child→super, standalone.
                let superNode: any = nodes.find(
                    (n) =>
                        n?.collectionType === "superfamily" &&
                        (n?.slug?.name || "").toLowerCase().trim() === slug
                )
                if (!superNode) {
                    const childNode = nodes.find(
                        (n) =>
                            (n?.slug?.name || "").toLowerCase().trim() ===
                                slug && n?.parent?.slug?.name
                    )
                    if (childNode?.parent?.slug?.name) {
                        const parentSlug = childNode.parent.slug.name
                            .toLowerCase()
                            .trim()
                        superNode = nodes.find(
                            (n) =>
                                n?.collectionType === "superfamily" &&
                                (n?.slug?.name || "").toLowerCase().trim() ===
                                    parentSlug
                        )
                    }
                }
                if (!superNode) {
                    const plain = nodes.find(
                        (n) =>
                            (n?.slug?.name || "").toLowerCase().trim() ===
                                slug && (n?.fontStyles?.length || 0) > 0
                    )
                    if (plain) {
                        superNode = {
                            name: plain.name,
                            slug: plain.slug,
                            children: [
                                {
                                    name: plain.name,
                                    slug: plain.slug,
                                    fontStyles: plain.fontStyles,
                                    cssUrl: plain.cssUrl,
                                },
                            ],
                        }
                    }
                }
                if (!superNode) {
                    setFontsLoaded(true)
                    return
                }

                const discoveredSlugs: string[] = []
                const discoveredCssUrls: string[] = []
                const pushSlug = (s: string | null | undefined) => {
                    if (!s) return
                    const k = s.trim().toLowerCase()
                    if (!k) return
                    if (discoveredSlugs.indexOf(k) === -1)
                        discoveredSlugs.push(k)
                }
                const pushCssUrl = (u: string | null | undefined) => {
                    if (!u) return
                    if (discoveredCssUrls.indexOf(u) === -1)
                        discoveredCssUrls.push(u)
                }
                pushSlug(slug)
                pushSlug((superNode.slug?.name || "").toLowerCase().trim())
                pushCssUrl(superNode.cssUrl)

                const rules: string[] = []
                const variableStyles: VariableStyle[] = []
                const walk = (
                    styles: any[],
                    ownerSlug: string,
                    ownerName: string
                ) => {
                    for (const s of styles || []) {
                        const vaxes = (s.variableAxes || []) as VarAxis[]
                        if (vaxes.length === 0) continue
                        const cssFamily = s.cssFamily || ""
                        const sources = s.webfontSources || []
                        if (cssFamily && sources.length > 0) {
                            rules.push(buildFontFaceCss(cssFamily, sources))
                            variableStyles.push({
                                fullFamily: cssFamily,
                                ownerSlug,
                                ownerName,
                                variableAxes: vaxes,
                                stylisticSetNames:
                                    s.fontFeatures?.stylisticSetNames || [],
                                supportedFeatures:
                                    s.fontFeatures?.supportedFeatures || [],
                            })
                        }
                    }
                }

                const superSlug = (superNode.slug?.name || "")
                    .toLowerCase()
                    .trim()
                const superName = superNode.name || ""
                for (const c of superNode.children || []) {
                    const childSlug = (c?.slug?.name || "").toLowerCase().trim()
                    pushSlug(childSlug)
                    pushCssUrl(c.cssUrl)
                    walk(
                        c.fontStyles || [],
                        childSlug || superSlug,
                        c.name || superName
                    )
                }
                walk(superNode.fontStyles || [], superSlug, superName)

                setCollectionName(superNode.name || "")
                setResolvedSlugs(discoveredSlugs)

                if (rules.length > 0) {
                    injectFontFaces(
                        rules.join("\n"),
                        `fontdue:${superSlug || slug}`
                    )
                }
                for (const u of discoveredCssUrls) injectFontdueCss(u)

                if (variableStyles.length === 0) {
                    setFontsLoaded(true)
                    return
                }

                // Prefer a variable face whose ownerSlug matches the
                // user's target exactly. Fall back to the first face
                // overall.
                const preferred =
                    variableStyles.find((v) => v.ownerSlug === slug) ||
                    variableStyles[0]
                setVariant(preferred)

                const fonts: FontFaceSet | undefined =
                    typeof document !== "undefined"
                        ? (document as any).fonts
                        : undefined
                const reveal = () => {
                    if (!cancelled) setFontsLoaded(true)
                }
                if (fonts) {
                    fonts
                        .load(`100px "${preferred.fullFamily}"`)
                        .then(reveal)
                        .catch(reveal)
                } else {
                    reveal()
                }
            })
            .catch(() => {
                if (!cancelled) setFontsLoaded(true)
            })
        const timeout = window.setTimeout(() => {
            if (!cancelled) setFontsLoaded(true)
        }, 3000)
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [slug, fontdueUrl])

    // Seed axisValue once the range is known so the first paint isn't
    // at 0 (out-of-range for most axes).
    React.useEffect(() => {
        if (activeAxis) {
            setAxisValue((activeAxis.minValue + activeAxis.maxValue) / 2)
        }
    }, [activeAxis])

    const fontVariationSettings = React.useMemo(() => {
        if (!activeAxis) return undefined
        return `'${activeAxis.axis}' ${axisValue.toFixed(2)}`
    }, [activeAxis, axisValue])

    // Prefer the matched variant's sub-family name (e.g. "Cina GEO
    // Standard") over the super-family name (e.g. "Cina GEO") so the
    // specimen text matches the slug the user pointed at.
    const prettyName = variant?.ownerName || collectionName || slugToTitle(slug)
    const effectiveDisplay =
        displayText && displayText.trim().length > 0 ? displayText : prettyName

    // Scale fontSize to the display area's height — same pattern as
    // Specimen. One line with line-height 1, so fontSize = displayH.
    // Text bleeds horizontally when its advance exceeds the padded
    // width (clipped by the root's overflow setting). Retries on a
    // couple of timers because Framer sometimes reports a zero height
    // on the first layout pass.
    React.useLayoutEffect(() => {
        if (typeof window === "undefined") return
        const display = displayRef.current
        const text = textRef.current
        if (!display || !text) return
        const apply = () => {
            const h = display.clientHeight
            if (h <= 0) return
            const fs = Math.max(12, h)
            text.style.fontSize = `${fs}px`
        }
        apply()
        const t1 = window.setTimeout(apply, 50)
        const t2 = window.setTimeout(apply, 250)
        let ro: ResizeObserver | null = null
        if ((window as any).ResizeObserver) {
            ro = new ResizeObserver(apply)
            ro.observe(display)
        }
        window.addEventListener("resize", apply)
        return () => {
            window.clearTimeout(t1)
            window.clearTimeout(t2)
            window.removeEventListener("resize", apply)
            if (ro) ro.disconnect()
        }
    }, [padding, controlsGap, otOpen, showControls, fontsLoaded])

    // Axis oscillation — sinusoidal ease between the axis extremes.
    // One full period (min → max → min) takes `cycleSeconds`.
    React.useEffect(() => {
        if (!activeAxis) return
        let raf = 0
        const start = performance.now()
        const P = Math.max(1, cycleSeconds)
        let pausedAt = 0
        let pausedElapsed = 0
        let wasPaused = false

        const tick = (now: number) => {
            if (pausedRef.current) {
                if (!wasPaused) {
                    pausedAt = now
                    wasPaused = true
                }
                raf = requestAnimationFrame(tick)
                return
            }
            if (wasPaused) {
                pausedElapsed += now - pausedAt
                wasPaused = false
            }
            const t = (now - start - pausedElapsed) / 1000
            const raw = (1 - Math.cos((t * 2 * Math.PI) / P)) / 2
            const next =
                activeAxis.minValue +
                raw * (activeAxis.maxValue - activeAxis.minValue)
            setAxisValue(next)
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [activeAxis, cycleSeconds])

    const pillBg = accent && accent.trim().length > 0 ? accent : foreground
    // Auto-contrast is the default, but when Framer passes a CSS
    // custom-property reference (or any value parseColor can't
    // understand) auto-contrast silently collapses to black. An
    // explicit `accentForeground` override takes precedence.
    const pillFg =
        accentForeground && accentForeground.trim().length > 0
            ? accentForeground
            : getContrastText(pillBg)

    const sliderPct = activeAxis
        ? ((axisValue - activeAxis.minValue) /
              (activeAxis.maxValue - activeAxis.minValue)) *
          100
        : 50
    const axisLabel = activeAxis
        ? activeAxis.name || activeAxis.axis.toUpperCase()
        : "Axis"
    const axisReadout = Math.round(axisValue)

    // Manual axis drag — active only when paused. The oscillation
    // loop reads `paused` via pausedRef and stops calling setAxisValue
    // while paused, so the value we set here stays put. Unpausing
    // resumes the oscillation from whatever value the user picked.
    const handleAxisDrag = (e: React.MouseEvent | React.TouchEvent) => {
        if (!activeAxis || !paused) return
        e.preventDefault()
        const track = e.currentTarget as HTMLElement
        const rect = track.getBoundingClientRect()
        const apply = (ev: MouseEvent | TouchEvent) => {
            const clientX =
                "touches" in ev && ev.touches.length > 0
                    ? ev.touches[0].clientX
                    : (ev as MouseEvent).clientX
            let pct = (clientX - rect.left) / rect.width
            pct = Math.max(0, Math.min(1, pct))
            const val =
                activeAxis.minValue +
                pct * (activeAxis.maxValue - activeAxis.minValue)
            setAxisValue(val)
        }
        const up = () => {
            window.removeEventListener("mousemove", apply)
            window.removeEventListener("mouseup", up)
            window.removeEventListener("touchmove", apply)
            window.removeEventListener("touchend", up)
        }
        apply(e.nativeEvent as any)
        window.addEventListener("mousemove", apply)
        window.addEventListener("mouseup", up)
        window.addEventListener("touchmove", apply)
        window.addEventListener("touchend", up)
    }

    const toggleFeature = (tag: string) => {
        setActiveFeatures((prev) => {
            const next = new Set(prev)
            if (next.has(tag)) next.delete(tag)
            else next.add(tag)
            return next
        })
    }

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                // Vertical-only root padding — lets the big display text
                // bleed edge-to-edge horizontally, with the bar padded
                // inward by `padding` and the display unpadded. Matches
                // the Specimen component's structure.
                padding: `${padding}px 0`,
                boxSizing: "border-box",
                background,
                color: foreground,
                fontFamily: "'Cina Sans', sans-serif",
                display: "flex",
                flexDirection: "column",
                overflow: "visible",
                opacity: fontsLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            {/* Fontdue <fontdue-type-testers> loaders — trigger
                Fontdue's session-authenticated @font-face registration
                path, which is what actually works on deployed Framer
                sites. One per resolved slug (super + every child). */}
            {resolvedSlugs.map((slg) =>
                React.createElement("fontdue-type-testers", {
                    key: slg,
                    "collection-slug": slg,
                    "data-wh-loader": slg,
                    style: {
                        position: "absolute",
                        width: 0,
                        height: 0,
                        overflow: "hidden",
                        visibility: "hidden",
                        pointerEvents: "none",
                    },
                })
            )}

            {showControls && (
                <>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "stretch",
                            width: "100%",
                            height: 27,
                            flex: "0 0 27px",
                            padding: `0 ${padding}px`,
                            gap: 16,
                            boxSizing: "border-box",
                            position: "relative",
                            zIndex: 2,
                            marginBottom: controlsGap,
                        }}
                    >
                        {/* Family name pill */}
                        <div
                            style={{
                                flex: "0 0 auto",
                                display: "flex",
                                alignItems: "center",
                                background: pillBg,
                                borderRadius: 4,
                                padding: "8px 16px",
                                gap: 16,
                                height: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 16,
                                    color: pillFg,
                                    lineHeight: "22.4px",
                                    whiteSpace: "nowrap",
                                    paddingTop: 2,
                                }}
                            >
                                {resolvedFamily || prettyName || "\u00a0"}
                            </span>
                            <div
                                style={{
                                    flex: "0 0 80px",
                                    width: 80,
                                    height: 1,
                                    background: pillFg,
                                }}
                            />
                        </div>

                        {/* Axis slider */}
                        <div
                            style={{
                                flex: "1 1 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 13.5,
                                height: "100%",
                                padding: "0 16px",
                                minWidth: 0,
                                boxSizing: "border-box",
                                opacity: activeAxis ? 1 : 0.35,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: foreground,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {axisLabel}
                            </span>
                            <div
                                onMouseDown={handleAxisDrag}
                                onTouchStart={handleAxisDrag}
                                style={{
                                    flex: 1,
                                    position: "relative",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "6px 0",
                                    // Only interactive while paused,
                                    // so the hit-area matches what the
                                    // user can actually do.
                                    cursor:
                                        paused && activeAxis
                                            ? "ew-resize"
                                            : "default",
                                    touchAction:
                                        paused && activeAxis ? "none" : "auto",
                                }}
                            >
                                <div
                                    style={{
                                        width: "100%",
                                        height: 1,
                                        background: foreground,
                                        WebkitMaskImage: `radial-gradient(circle 8.5px at ${sliderPct}% 50%, transparent 99%, black 100%)`,
                                        maskImage: `radial-gradient(circle 8.5px at ${sliderPct}% 50%, transparent 99%, black 100%)`,
                                        pointerEvents: "none",
                                    }}
                                />
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "50%",
                                        left: `${sliderPct}%`,
                                        width: 11,
                                        height: 11,
                                        background: foreground,
                                        borderRadius: 9999,
                                        transform: "translate(-50%, -50%)",
                                        pointerEvents: "none",
                                    }}
                                />
                            </div>
                            <span
                                style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: foreground,
                                    minWidth: 36,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {axisReadout}
                            </span>
                        </div>

                        {/* Pause */}
                        <div
                            onClick={() => setPaused((v) => !v)}
                            style={{
                                flex: "0 0 auto",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "0 12px",
                                cursor: "pointer",
                                userSelect: "none",
                                color: foreground,
                            }}
                            title={paused ? "Play" : "Pause"}
                        >
                            {paused ? (
                                <svg width="10" height="12" viewBox="0 0 10 12">
                                    <polygon
                                        points="0,0 10,6 0,12"
                                        fill="currentColor"
                                    />
                                </svg>
                            ) : (
                                <svg width="10" height="12" viewBox="0 0 10 12">
                                    <rect
                                        x="0"
                                        y="0"
                                        width="3"
                                        height="12"
                                        fill="currentColor"
                                    />
                                    <rect
                                        x="7"
                                        y="0"
                                        width="3"
                                        height="12"
                                        fill="currentColor"
                                    />
                                </svg>
                            )}
                        </div>

                        {/* OT Features pill */}
                        {toggleable.length > 0 && (
                            <div
                                onClick={() => setOtOpen((v) => !v)}
                                style={{
                                    flex: "0 0 auto",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                    padding: "0 16px",
                                    height: "100%",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: foreground,
                                }}
                            >
                                <span style={{ paddingTop: 2 }}>
                                    OT Features
                                </span>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transform: otOpen
                                            ? "rotate(180deg)"
                                            : "rotate(0deg)",
                                        transition: "transform 0.25s ease",
                                    }}
                                >
                                    <svg
                                        width="12"
                                        height="7"
                                        viewBox="0 0 12 7"
                                    >
                                        <polyline
                                            points="1,1 6,6 11,1"
                                            stroke="currentColor"
                                            strokeWidth="1"
                                            strokeLinecap="square"
                                            fill="none"
                                        />
                                    </svg>
                                </span>
                            </div>
                        )}
                    </div>

                    {/* OT Features panel — inline, pushes content. */}
                    {toggleable.length > 0 && (
                        <div
                            style={{
                                width: "100%",
                                display: "grid",
                                gridTemplateRows: otOpen ? "1fr" : "0fr",
                                transition: "grid-template-rows 0.35s ease",
                                boxSizing: "border-box",
                                color: foreground,
                                flex: "0 0 auto",
                                padding: `0 ${padding}px`,
                            }}
                        >
                            <div style={{ overflow: "hidden", minHeight: 0 }}>
                                <div
                                    style={{
                                        padding: "24px 0",
                                        display: "grid",
                                        gridTemplateColumns: "repeat(4, 1fr)",
                                        columnGap: 24,
                                        rowGap: 8,
                                        opacity: otOpen ? 1 : 0,
                                        transform: otOpen
                                            ? "translateY(0)"
                                            : "translateY(-4px)",
                                        transition:
                                            "opacity 0.25s ease 0.05s, transform 0.3s ease",
                                    }}
                                >
                                    {toggleable.map(({ tag, label }) => {
                                        const active = activeFeatures.has(tag)
                                        return (
                                            <div
                                                key={tag}
                                                onClick={() =>
                                                    toggleFeature(tag)
                                                }
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 12,
                                                    padding: "4px 0",
                                                    fontSize: 14,
                                                    lineHeight: "14px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 14,
                                                        height: 14,
                                                        border: `1px solid ${foreground}`,
                                                        flexShrink: 0,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                        boxSizing: "border-box",
                                                    }}
                                                >
                                                    {active && (
                                                        <div
                                                            style={{
                                                                width: 8,
                                                                height: 8,
                                                                background:
                                                                    foreground,
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                <span>{label}</span>
                                                <span
                                                    style={{
                                                        marginLeft: "auto",
                                                        fontSize: 14,
                                                        lineHeight: "14px",
                                                    }}
                                                >
                                                    {tag}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Display area — horizontal padding matches the bar so
                the text's left edge lines up with the pill. fontSize
                is set imperatively by the layout effect above to
                match this div's clientHeight. Single line with
                line-height 1, so the glyphs fill the full height and
                bleed past the right edge when the text is wider than
                the padded width. */}
            <div
                ref={displayRef}
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    minHeight: 0,
                    position: "relative",
                    zIndex: 1,
                    padding: `0 ${padding}px`,
                    boxSizing: "border-box",
                }}
            >
                <div
                    ref={textRef}
                    style={{
                        fontFamily: resolvedFamily
                            ? `'${resolvedFamily}', sans-serif`
                            : "sans-serif",
                        fontWeight: 400,
                        // Display text has its own color knob so CMS
                        // records can bind a per-specimen color without
                        // disturbing the top-bar foreground.
                        color:
                            displayColor && displayColor.trim().length > 0
                                ? displayColor
                                : foreground,
                        letterSpacing: "-0.01em",
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        fontFeatureSettings,
                        ...(fontVariationSettings
                            ? { fontVariationSettings }
                            : {}),
                    }}
                >
                    {effectiveDisplay}
                </div>
            </div>

            {!activeAxis && fontsLoaded && (
                <div
                    style={{
                        position: "absolute",
                        top: padding,
                        left: padding,
                        fontSize: 12,
                        color: foreground,
                        opacity: 0.6,
                        zIndex: 2,
                    }}
                >
                    No variable axes found for this slug — point at a variable
                    face.
                </div>
            )}
        </div>
    )
}

WeightHero.defaultProps = {
    familySlug: "cina-geo",
    displayText: "",
    axisTag: "wght",
    cycleSeconds: 9,
    showControls: true,
    padding: 24,
    controlsGap: 24,
    foreground: "#000000",
    displayColor: "",
    background: "#9DFFD6",
    accent: "#000000",
    accentForeground: "",
    fontdueUrl: "https://www.publictype.us",
}

addPropertyControls(WeightHero, {
    familySlug: {
        type: ControlType.String,
        title: "Family",
        defaultValue: "cina-geo",
        description: "Fontdue slug (super-family, child, or standalone family)",
    },
    displayText: {
        type: ControlType.String,
        title: "Display Text",
        defaultValue: "",
        description:
            "Leave empty to use the collection name. Single line only.",
        displayTextArea: true,
    },
    axisTag: {
        type: ControlType.String,
        title: "Axis",
        defaultValue: "wght",
        description: "Variable axis tag to animate (e.g. wght, wdth, opsz)",
    },
    cycleSeconds: {
        type: ControlType.Number,
        title: "Cycle (s)",
        defaultValue: 9,
        min: 2,
        max: 60,
        step: 0.5,
        displayStepper: true,
        description: "Seconds for one full min → max → min round-trip",
    },
    showControls: {
        type: ControlType.Boolean,
        title: "Top Bar",
        enabledTitle: "Show",
        disabledTitle: "Hide",
        defaultValue: true,
    },
    padding: {
        type: ControlType.Number,
        title: "Padding",
        defaultValue: 24,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        description: "Inner padding — vertical on root, horizontal on bar",
    },
    controlsGap: {
        type: ControlType.Number,
        title: "Controls Gap",
        defaultValue: 24,
        min: 0,
        max: 400,
        step: 1,
        unit: "px",
        description: "Gap between the top bar and the display area",
    },
    foreground: {
        type: ControlType.Color,
        title: "Foreground",
        defaultValue: "#000000",
    },
    displayColor: {
        type: ControlType.Color,
        title: "Display Color",
        description:
            "Color of the specimen text. Leave empty to inherit Foreground. CMS-bindable.",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#9DFFD6",
    },
    accent: {
        type: ControlType.Color,
        title: "Pill",
        defaultValue: "#000000",
        description: "Family pill background",
    },
    accentForeground: {
        type: ControlType.Color,
        title: "Pill Text",
        description:
            "Family pill text + underline. Leave empty for auto-contrast against the pill background.",
    },
    fontdueUrl: {
        type: ControlType.String,
        title: "Fontdue URL",
        defaultValue: "https://www.publictype.us",
    },
})

// ============================================================
// @font-face + Fontdue CSS injection — same helpers as HybridHero.
// ============================================================

const INJECTED_FACE_KEYS = new Set<string>()
function injectFontFaces(cssRules: string, key: string) {
    if (typeof document === "undefined") return
    if (INJECTED_FACE_KEYS.has(key)) return
    INJECTED_FACE_KEYS.add(key)
    const style = document.createElement("style")
    style.setAttribute("data-fontdue-weight-hero", key)
    style.textContent = cssRules
    document.head.appendChild(style)
}

function buildFontFaceCss(
    family: string,
    sources: Array<{ format: string; url: string }>
): string {
    const ordered = [...sources].sort((a, b) => {
        const score = (f: string) => (f === "woff2" ? 0 : f === "woff" ? 1 : 2)
        return score(a.format) - score(b.format)
    })
    const srcList = ordered
        .map((s) => `url("${s.url}") format("${s.format}")`)
        .join(", ")
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:100 900;font-display:swap;src:local(""),${srcList};}`
}

const INJECTED_CSS = new Set<string>()
function injectFontdueCss(cssUrl: string | null | undefined) {
    if (typeof document === "undefined") return
    if (!cssUrl) return
    if (INJECTED_CSS.has(cssUrl)) return
    INJECTED_CSS.add(cssUrl)
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = cssUrl
    link.dataset.fontdue = "true"
    document.head.appendChild(link)
}
