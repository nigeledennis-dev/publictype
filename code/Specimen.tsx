import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * SPECIMEN
 *
 * Two-line headline-scale display of a font's characters and numerals.
 * Text is sized relative to the container width so the lines bleed
 * naturally off the frame for the offset specimen look.
 *
 * CMS-bindable sub-family slugs (up to 6). The name pill shows whichever
 * sub-family is currently active; the style pill drops down styles for
 * that sub-family; the shuffle button picks a random sub-family +
 * random style + random OT feature and applies all three at once.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 720
 */

type TesterProps = {
    slug1: string
    slug2: string
    slug3: string
    slug4: string
    slug5: string
    slug6: string
    line1: string
    line2: string
    sizeRatio: number
    specimenLineHeight: number
    foreground: string
    background: string
    backgroundImage: string
    accent: string
    accentForeground: string
    stylePillColor: string
    stylePillForeground: string
    shufflePillColor: string
    shufflePillForeground: string
    padding: number
    controlsGap: number
    fontdueUrl: string
    debugSize: boolean
}

type SpecimenStyle = {
    name: string
    cssFamily: string
    cssWeight: number
    fullFamily: string
    isItalic: boolean
    /** OT features on this style that aren't always-on defaults */
    toggleableFeatures: string[]
}

type SpecimenSubFamily = {
    name: string
    slug: string
    styles: SpecimenStyle[]
}

export default function Specimen(props: TesterProps) {
    const {
        slug1,
        slug2,
        slug3,
        slug4,
        slug5,
        slug6,
        line1,
        line2,
        sizeRatio,
        specimenLineHeight,
        foreground,
        background,
        backgroundImage,
        accent,
        accentForeground,
        stylePillColor,
        stylePillForeground,
        shufflePillColor,
        shufflePillForeground,
        padding,
        controlsGap,
        fontdueUrl,
        debugSize,
    } = props

    // Debug readout of what the root actually measures at — toggled
    // by the `debugSize` prop.
    const [dbgRootH, setDbgRootH] = React.useState<number>(0)
    const [dbgFs, setDbgFs] = React.useState<number>(0)

    // Fontdue registers each Cina Sans weight as its OWN family name:
    //   "Cina Sans Thin", "Cina Sans Regular", "Cina Sans Medium", ...
    // NOT plain "Cina Sans" (which matches nothing). This matches how
    // the Framer-deployed site already references these fonts.
    const uiFontChain = "'Cina Sans Regular', sans-serif"

    // Guarantee the UI font is loaded, regardless of whether the page's
    // Framer typography happens to reference Cina Sans elsewhere.
    React.useEffect(() => {
        ensureUIFontLoaded()
    }, [])

    // Active slug list (trimmed, non-empty, de-duped, order preserved)
    const slugs = React.useMemo(() => {
        const seen = new Set<string>()
        const out: string[] = []
        for (const raw of [slug1, slug2, slug3, slug4, slug5, slug6]) {
            const s = (raw || "").trim().toLowerCase()
            if (!s || seen.has(s)) continue
            seen.add(s)
            out.push(s)
        }
        return out
    }, [slug1, slug2, slug3, slug4, slug5, slug6])
    const slugsKey = slugs.join("|")

    const [subFamilies, setSubFamilies] = React.useState<SpecimenSubFamily[]>(
        []
    )
    const [activeSubIndex, setActiveSubIndex] = React.useState(0)
    const [selectedStyle, setSelectedStyle] = React.useState("")
    const [activeFeatures, setActiveFeatures] = React.useState<Set<string>>(
        new Set()
    )
    // Lazy-load gate — hides the specimen until the Fontdue web
    // fonts have finished downloading, so visitors never see the
    // huge headline glyphs flash from a fallback face into the
    // real one.
    const [fontsLoaded, setFontsLoaded] = React.useState(false)

    const activeSub: SpecimenSubFamily | null =
        subFamilies[activeSubIndex] || subFamilies[0] || null
    const styleNames = activeSub?.styles.map((s) => s.name) || []
    const currentStyle = React.useMemo(
        () => activeSub?.styles.find((s) => s.name === selectedStyle) || null,
        [activeSub, selectedStyle]
    )

    const [styleMenuOpen, setStyleMenuOpen] = React.useState(false)
    const [subMenuOpen, setSubMenuOpen] = React.useState(false)
    const stylePillRef = React.useRef<HTMLDivElement | null>(null)
    const subPillRef = React.useRef<HTMLDivElement | null>(null)
    const userTouchedRef = React.useRef(false)

    // Measure the ROOT's height (that's what Framer assigns via Fill),
    // subtract the known top-bar + padding overhead, split across two
    // lines, write fontSize straight onto the line DOM. No React
    // state, no CSS container queries — just arithmetic.
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    const line1Ref = React.useRef<HTMLDivElement | null>(null)
    const line2Ref = React.useRef<HTMLDivElement | null>(null)

    React.useLayoutEffect(() => {
        if (typeof window === "undefined") return
        const root = rootRef.current
        if (!root) return
        const TOP_BAR = 27
        const apply = () => {
            const rootH = root.clientHeight
            if (rootH <= 0) return
            const textAreaH = rootH - padding * 2 - TOP_BAR - controlsGap
            if (textAreaH <= 0) return
            const lh = Math.max(0.5, specimenLineHeight || 1)
            const ratio = sizeRatio || 1
            // Clamp lh to 1 for the size calc: we want the visible
            // GLYPHS to fill the frame, not the line-boxes. When the
            // user sets leading > 1, the extra leading bleeds past
            // the frame edges (clipped by overflow: hidden) instead
            // of shrinking the glyphs.
            const fitLh = Math.min(lh, 1)
            const fs = Math.max(12, (textAreaH / (2 * fitLh)) * ratio)
            const px = `${fs}px`
            if (line1Ref.current) line1Ref.current.style.fontSize = px
            if (line2Ref.current) line2Ref.current.style.fontSize = px
            // Record for the debug overlay. Guard so we don't trigger
            // re-renders when the number hasn't actually changed.
            setDbgRootH((prev) => (Math.abs(prev - rootH) > 0.5 ? rootH : prev))
            setDbgFs((prev) => (Math.abs(prev - fs) > 0.5 ? fs : prev))
        }
        apply()
        // Retry a couple of times in case Framer is still laying out.
        const t1 = window.setTimeout(apply, 50)
        const t2 = window.setTimeout(apply, 250)
        let ro: ResizeObserver | null = null
        if ((window as any).ResizeObserver) {
            ro = new ResizeObserver(apply)
            ro.observe(root)
        }
        window.addEventListener("resize", apply)
        return () => {
            window.clearTimeout(t1)
            window.clearTimeout(t2)
            window.removeEventListener("resize", apply)
            if (ro) ro.disconnect()
        }
    }, [padding, controlsGap, specimenLineHeight, sizeRatio])

    // Close either menu on outside click
    React.useEffect(() => {
        if (!styleMenuOpen && !subMenuOpen) return
        const onDown = (e: MouseEvent) => {
            const sp = stylePillRef.current
            const fp = subPillRef.current
            if (styleMenuOpen && sp && !sp.contains(e.target as Node)) {
                setStyleMenuOpen(false)
            }
            if (subMenuOpen && fp && !fp.contains(e.target as Node)) {
                setSubMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [styleMenuOpen, subMenuOpen])

    // Keep selectedStyle valid as the active sub-family changes.
    // Prefer Medium → Regular → Bold → first non-italic → first.
    React.useEffect(() => {
        if (!activeSub || activeSub.styles.length === 0) {
            setSelectedStyle("")
            return
        }
        if (
            userTouchedRef.current &&
            activeSub.styles.some((s) => s.name === selectedStyle)
        ) {
            return
        }
        const order = [/^medium$/i, /^regular$/i, /^bold$/i]
        for (const re of order) {
            const hit = activeSub.styles.find((s) => re.test(s.name))
            if (hit) {
                setSelectedStyle(hit.name)
                return
            }
        }
        const nonItalic = activeSub.styles.find((s) => !s.isItalic)
        setSelectedStyle((nonItalic || activeSub.styles[0]).name)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSubIndex, subFamilies.length])

    // Drop active features that aren't supported by the current style
    React.useEffect(() => {
        if (!currentStyle) return
        setActiveFeatures((prev) => {
            let changed = false
            const next = new Set<string>()
            for (const f of prev) {
                if (currentStyle.toggleableFeatures.includes(f)) next.add(f)
                else changed = true
            }
            return changed ? next : prev
        })
    }, [currentStyle])

    // ---- Fetch + inject @font-face ----
    React.useEffect(() => {
        if (slugs.length === 0) {
            setSubFamilies([])
            return
        }
        let cancelled = false
        const query = `{
  viewer {
    fontCollections(first: 100) {
      edges {
        node {
          name
          slug { name }
          collectionType
          parent { slug { name } }
          fontStyles {
            name
            cssFamily
            cssWeight
            cssStyle
            webfontSources { format url }
            variableAxes { axis }
            fontFeatures {
              supportedFeatures
            }
          }
          children {
            name
            slug { name }
            fontStyles {
              name
              cssFamily
              cssWeight
              cssStyle
              webfontSources { format url }
              variableAxes { axis }
              fontFeatures {
                supportedFeatures
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
                const nodes: any[] = edges.map((e: any) => e.node)

                // For each slug, resolve it to a child node (the actual
                // sub-family whose styles we'll show). Accepts:
                //   • Child slug directly
                //   • Super family slug → first non-variable child
                //   • Standalone family slug
                const resolvedChildren: any[] = []
                const seenChildSlugs = new Set<string>()
                const pushChild = (childLike: any) => {
                    const s = (childLike?.slug?.name || "").toLowerCase().trim()
                    const key = s || childLike.name
                    if (seenChildSlugs.has(key)) return
                    seenChildSlugs.add(key)
                    resolvedChildren.push(childLike)
                }
                const injectedSupers = new Set<string>()
                const injectSuperFaces = (superNode: any) => {
                    if (!superNode) return
                    const superSlug =
                        (superNode.slug?.name || "").toLowerCase().trim() ||
                        superNode.name
                    if (injectedSupers.has(superSlug)) return
                    injectedSupers.add(superSlug)
                    const rules: string[] = []
                    const walk = (styles: any[]) => {
                        for (const s of styles || []) {
                            // Variable woff2s are valid @font-face targets.
                            // Collections distributed only as variable fonts
                            // (Skol, etc.) produced zero rules when we skipped
                            // them, leaving the specimen in sans-serif.
                            const cssFamily = s.cssFamily || ""
                            const fullFamily =
                                cssFamily && s.name
                                    ? `${cssFamily} ${s.name}`
                                    : cssFamily
                            const sources = s.webfontSources || []
                            if (fullFamily && sources.length > 0) {
                                rules.push(
                                    buildFontFaceCss(fullFamily, sources)
                                )
                            }
                        }
                    }
                    for (const c of superNode.children || []) {
                        walk(c.fontStyles || [])
                    }
                    walk(superNode.fontStyles || [])
                    if (rules.length > 0) {
                        injectFontFaces(
                            rules.join("\n"),
                            `fontdue:${superSlug}`
                        )
                    }
                }

                for (const target of slugs) {
                    // 1. Child slug match: find the node and walk up
                    //    to its super to inject the full face set.
                    const childNode = nodes.find(
                        (n) =>
                            (n.slug?.name || "").toLowerCase() === target &&
                            n.parent?.slug?.name
                    )
                    if (childNode) {
                        const parentSlug = childNode.parent.slug.name
                            .toLowerCase()
                            .trim()
                        const sup = nodes.find(
                            (n) =>
                                n.collectionType === "superfamily" &&
                                (n.slug?.name || "").toLowerCase() ===
                                    parentSlug
                        )
                        injectSuperFaces(sup)
                        pushChild(childNode)
                        continue
                    }

                    // 2. Super family slug: fall through to first
                    //    non-variable child with styles.
                    const sup = nodes.find(
                        (n) =>
                            n.collectionType === "superfamily" &&
                            (n.slug?.name || "").toLowerCase() === target
                    )
                    if (sup) {
                        injectSuperFaces(sup)
                        const kids = (sup.children || []).filter(
                            (c: any) =>
                                (c?.fontStyles?.length || 0) > 0 &&
                                !/variable|\bvf\b/i.test(c?.name || "")
                        )
                        const first =
                            kids[0] ||
                            (sup.children || []).find(
                                (c: any) => (c?.fontStyles?.length || 0) > 0
                            )
                        if (first) pushChild(first)
                        continue
                    }

                    // 3. Standalone family slug: use as its own "child"
                    const plain = nodes.find(
                        (n) =>
                            (n.slug?.name || "").toLowerCase() === target &&
                            (n.fontStyles?.length || 0) > 0
                    )
                    if (plain) {
                        // Synthesize a single-child super for face
                        // injection
                        injectSuperFaces({
                            ...plain,
                            children: [
                                {
                                    name: plain.name,
                                    slug: plain.slug,
                                    fontStyles: plain.fontStyles || [],
                                },
                            ],
                        })
                        pushChild({
                            name: plain.name,
                            slug: plain.slug,
                            fontStyles: plain.fontStyles || [],
                        })
                    }
                }

                // Build sub-family data objects in slug order
                const subs: SpecimenSubFamily[] = []
                for (const child of resolvedChildren) {
                    const styles: SpecimenStyle[] = []
                    for (const s of child.fontStyles || []) {
                        // Include variable styles — dropping them left
                        // variable-only sub-families (Skol) with zero
                        // styles, so the whole sub-family was skipped at
                        // the `if (styles.length === 0)` guard below.
                        const cssFamily = s.cssFamily || ""
                        const fullFamily =
                            cssFamily && s.name
                                ? `${cssFamily} ${s.name}`
                                : cssFamily
                        const supported =
                            s.fontFeatures?.supportedFeatures || []
                        const toggleable = supported.filter(
                            (t: string) => !DEFAULT_FEATURES.has(t)
                        )
                        styles.push({
                            name: s.name,
                            cssFamily,
                            cssWeight: parseInt(s.cssWeight, 10) || 400,
                            fullFamily,
                            isItalic:
                                /italic/i.test(s.name) ||
                                /italic/i.test(s.cssStyle || ""),
                            toggleableFeatures: toggleable,
                        })
                    }
                    if (styles.length === 0) continue
                    subs.push({
                        name: child.name || "",
                        slug: (child.slug?.name || "").trim(),
                        styles,
                    })
                }
                setSubFamilies(subs)
                setActiveSubIndex(0)

                // Wait for every style across every sub-family to
                // finish downloading, then reveal. Fonts are already
                // injected above via injectSuperFaces — we're just
                // watching for the browser to have them in hand.
                const fonts: FontFaceSet | undefined =
                    typeof document !== "undefined"
                        ? (document as any).fonts
                        : undefined
                const reveal = () => {
                    if (!cancelled) setFontsLoaded(true)
                }
                if (fonts && subs.length > 0) {
                    const families = subs.flatMap((sf) =>
                        sf.styles.map((s) => s.fullFamily).filter(Boolean)
                    )
                    Promise.all(
                        families.map((f) =>
                            fonts.load(`100px "${f}"`).catch(() => null)
                        )
                    ).then(reveal)
                } else {
                    reveal()
                }
            })
            .catch(() => {
                if (!cancelled) setFontsLoaded(true)
            })
        // Safety net — reveal after 3s regardless so a slow network
        // or a typo in a slug doesn't leave the specimen blank.
        const timeout = window.setTimeout(() => {
            if (!cancelled) setFontsLoaded(true)
        }, 3000)
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [slugsKey, fontdueUrl])

    // ---- Shuffle ----
    // Shuffle always does SOMETHING visible, even when there's only a
    // single sub-family (like Ghostly Gothic) — it'll keep the family
    // fixed but cycle style + OT features. When multiple sub-families
    // exist, it also avoids re-picking the current family / style so
    // every click feels like a change.
    const shuffle = React.useCallback(() => {
        if (subFamilies.length === 0) return
        const rand = (n: number) => Math.floor(Math.random() * n)

        // Pick a sub-family, avoiding the current one when there's
        // more than one to choose from.
        let nextSubIndex = rand(subFamilies.length)
        if (subFamilies.length > 1 && nextSubIndex === activeSubIndex) {
            nextSubIndex =
                (activeSubIndex + 1 + rand(subFamilies.length - 1)) %
                subFamilies.length
        }
        const nextSub = subFamilies[nextSubIndex]
        if (!nextSub || nextSub.styles.length === 0) return

        // Pick a style, avoiding the current one when the new
        // sub-family has more than one option.
        let nextStyle = nextSub.styles[rand(nextSub.styles.length)]
        if (nextSub.styles.length > 1 && nextStyle.name === selectedStyle) {
            const others = nextSub.styles.filter(
                (s) => s.name !== selectedStyle
            )
            nextStyle = others[rand(others.length)]
        }

        // Always pick an OT feature when any are available.
        const nextFeatures = new Set<string>()
        const feats = nextStyle.toggleableFeatures
        if (feats.length > 0) {
            nextFeatures.add(feats[rand(feats.length)])
        }

        userTouchedRef.current = true
        setActiveSubIndex(nextSubIndex)
        setSelectedStyle(nextStyle.name)
        setActiveFeatures(nextFeatures)
    }, [subFamilies, activeSubIndex, selectedStyle])

    // Pill colors. Each pill has an explicit background AND foreground
    // control. When a foreground isn't provided we fall back to
    // auto-contrast, and when auto-contrast fails (e.g. Framer hands us
    // a color format `parseColor` doesn't understand, like display-p3
    // or hsl), we use the component's `foreground` so the text stays
    // legible against the site's design tokens.
    const namePillBg = accent && accent.trim() ? accent : foreground
    const namePillText =
        accentForeground && accentForeground.trim()
            ? accentForeground
            : parseColor(namePillBg)
              ? getContrastText(namePillBg)
              : foreground
    const stylePillBg =
        stylePillColor && stylePillColor.trim() ? stylePillColor : foreground
    const stylePillText =
        stylePillForeground && stylePillForeground.trim()
            ? stylePillForeground
            : parseColor(stylePillBg)
              ? getContrastText(stylePillBg)
              : foreground

    // Strip collection name prefix off a style label
    const displayStyle = React.useCallback(
        (s: string) => {
            if (!s) return "Regular"
            const prefix = (activeSub?.name || "").trim()
            if (!prefix) return s
            const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const cleaned = s
                .replace(new RegExp(`^${escaped}\\s*`, "i"), "")
                .trim()
            return cleaned || "Regular"
        },
        [activeSub]
    )

    // `lineLeading` kept for lineStyle's CSS `line-height`. The
    // font-size itself is set imperatively in the layout effect
    // above so we don't have to fight React state batching.
    const lineLeading = Math.max(0.5, specimenLineHeight || 1)

    // Only the exact @font-face family + generic sans-serif as a
    // fallback. We deliberately DO NOT fall back to `activeSub.name`
    // (e.g. "Ghostly Gothic") because that could match a locally-
    // installed system font and render with the wrong file.
    const familyChain = currentStyle
        ? `'${currentStyle.fullFamily}', sans-serif`
        : "sans-serif"

    const fontFeatureSettings =
        activeFeatures.size > 0
            ? Array.from(activeFeatures)
                  .map((f) => `'${f}' 1`)
                  .join(", ")
            : "normal"

    // `fontSize` is deliberately omitted from this object — it's
    // written imperatively on each line's DOM node by the layout
    // effect above. If we put it here, React would re-apply it on
    // every render (including the debug-state updates below) and
    // clobber the imperative value.
    const lineStyle: React.CSSProperties = {
        fontFamily: familyChain,
        fontStyle: currentStyle?.isItalic ? "italic" : "normal",
        lineHeight: lineLeading,
        color: foreground,
        whiteSpace: "nowrap",
        display: "block",
        fontFeatureSettings,
    }

    // ---- Pill styles ----
    const barStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        height: 27,
        flex: "0 0 27px",
        width: "100%",
        padding: `0 ${padding}px`,
        boxSizing: "border-box",
        gap: 0,
        marginBottom: controlsGap,
    }

    const leftClusterStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        flex: "0 0 auto",
        minWidth: 0,
        height: "100%",
    }

    const namePillStyle: React.CSSProperties = {
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        background: namePillBg,
        borderRadius: 4,
        padding: "8px 16px",
        gap: 16,
        height: "100%",
        boxSizing: "border-box",
        position: "relative",
    }
    const namePillLabelStyle: React.CSSProperties = {
        fontFamily: uiFontChain,
        fontSize: 16,
        fontWeight: 400,
        color: namePillText,
        lineHeight: "22.4px",
        whiteSpace: "nowrap",
        paddingTop: 2,
    }
    const namePillLineStyle: React.CSSProperties = {
        flex: "0 0 80px",
        width: 80,
        height: 1,
        background: namePillText,
    }

    // Sub-family dropdown menu (mirrors the style menu visuals but
    // uses the name pill's colors)
    const subMenuWrapStyle: React.CSSProperties = {
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        minWidth: "100%",
        zIndex: 10,
        overflow: "hidden",
        maxHeight: subMenuOpen ? 720 : 0,
        transition: "max-height 0.35s ease",
        pointerEvents: subMenuOpen ? "auto" : "none",
    }
    const subMenuListStyle: React.CSSProperties = {
        background: namePillBg,
        color: namePillText,
        borderRadius: 14,
        padding: "8px 0",
        maxHeight: 720,
        overflowY: "auto",
        opacity: subMenuOpen ? 1 : 0,
        transform: subMenuOpen ? "translateY(0)" : "translateY(-4px)",
        transition: "opacity 0.25s ease 0.05s, transform 0.3s ease",
    }

    const stylePillStyleBase: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 12,
        height: "100%",
        padding: "8px 16px",
        background: stylePillBg,
        color: stylePillText,
        borderRadius: 9999,
        fontFamily: uiFontChain,
        fontSize: 16,
        fontWeight: 400,
        lineHeight: "22.4px",
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
        whiteSpace: "nowrap",
        flexShrink: 0,
        boxSizing: "border-box",
    }

    const styleMenuWrapStyle: React.CSSProperties = {
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        minWidth: "100%",
        zIndex: 10,
        overflow: "hidden",
        maxHeight: styleMenuOpen ? 720 : 0,
        transition: "max-height 0.35s ease",
        pointerEvents: styleMenuOpen ? "auto" : "none",
    }
    const styleMenuListStyle: React.CSSProperties = {
        background: stylePillBg,
        color: stylePillText,
        borderRadius: 14,
        padding: "8px 0",
        maxHeight: 720,
        overflowY: "auto",
        opacity: styleMenuOpen ? 1 : 0,
        transform: styleMenuOpen ? "translateY(0)" : "translateY(-4px)",
        transition: "opacity 0.25s ease 0.05s, transform 0.3s ease",
    }

    // Shuffle pill — same shape as the style pill. Background and
    // text/icon colors come from their own CMS-bindable controls so
    // the pill can be themed independently of the surrounding chrome.
    const shufflePillBg =
        shufflePillColor && shufflePillColor.trim()
            ? shufflePillColor
            : foreground
    const shufflePillFg =
        shufflePillForeground && shufflePillForeground.trim()
            ? shufflePillForeground
            : background
    const shufflePillStyle: React.CSSProperties = {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height: "100%",
        padding: "8px 16px",
        background: shufflePillBg,
        color: shufflePillFg,
        borderRadius: 9999,
        fontFamily: uiFontChain,
        fontSize: 16,
        fontWeight: 400,
        lineHeight: "22.4px",
        cursor: "pointer",
        userSelect: "none",
        opacity: subFamilies.length > 0 ? 1 : 0.4,
        position: "relative",
        zIndex: 20,
        flexShrink: 0,
        boxSizing: "border-box",
        whiteSpace: "nowrap",
    }

    return (
        <div
            ref={rootRef}
            data-pt-specimen=""
            style={{
                width: "100%",
                height: "100%",
                // Belt-and-suspenders for Framer's various wrapper
                // layout modes: `height: 100%` covers block/grid
                // parents with a definite height, `flex: 1 1 auto`
                // covers flex parents, `alignSelf: stretch` covers
                // grid parents that don't propagate height. One of
                // these will make us claim the parent's vertical
                // space regardless of which layout Framer assigns.
                flex: "1 1 auto",
                alignSelf: "stretch",
                minHeight: 0,
                padding: `${padding}px 0`,
                background,
                ...(backgroundImage
                    ? {
                          backgroundImage: `url(${backgroundImage})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                      }
                    : {}),
                color: foreground,
                fontFamily: uiFontChain,
                boxSizing: "border-box",
                // Flex column so the specimen area can claim the
                // leftover vertical space below the top bar.
                display: "flex",
                flexDirection: "column",
                // Clip horizontal bleed at the frame so the specimen
                // lines don't overflow past their Framer container.
                // Height is driven by the Framer frame — the lines
                // auto-fit into whatever vertical space the flex
                // child resolves to.
                overflow: "visible",
                opacity: fontsLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            {/* Top bar */}
            <div style={barStyle}>
                <div style={leftClusterStyle}>
                    {/* Font name pill — dropdown when > 1 sub-family,
                        plain label otherwise. Shuffle still swaps it too. */}
                    <div
                        ref={subPillRef}
                        style={{
                            ...namePillStyle,
                            cursor:
                                subFamilies.length > 1 ? "pointer" : "default",
                        }}
                        onMouseDown={
                            subFamilies.length > 1
                                ? (e) => {
                                      e.preventDefault()
                                      setSubMenuOpen((v) => !v)
                                  }
                                : undefined
                        }
                    >
                        <span style={namePillLabelStyle}>
                            {activeSub?.name || "\u00a0"}
                        </span>
                        {subFamilies.length > 1 && (
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: namePillText,
                                    transform: subMenuOpen
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                    transition: "transform 0.25s ease",
                                }}
                            >
                                <svg width="12" height="7" viewBox="0 0 12 7">
                                    <polyline
                                        points="1,1 6,6 11,1"
                                        stroke="currentColor"
                                        strokeWidth="1"
                                        strokeLinecap="square"
                                        fill="none"
                                    />
                                </svg>
                            </span>
                        )}
                        <div style={namePillLineStyle} />
                        {subFamilies.length > 1 && (
                            <div style={subMenuWrapStyle}>
                                <div style={subMenuListStyle}>
                                    {subFamilies.map((sf, i) => {
                                        const active = i === activeSubIndex
                                        return (
                                            <div
                                                key={sf.slug || sf.name}
                                                onMouseDown={(e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    userTouchedRef.current = true
                                                    setActiveSubIndex(i)
                                                    setSubMenuOpen(false)
                                                }}
                                                style={{
                                                    padding: "6px 16px",
                                                    cursor: "pointer",
                                                    fontSize: 16,
                                                    lineHeight: "22.4px",
                                                    whiteSpace: "nowrap",
                                                    background: active
                                                        ? namePillText
                                                        : "transparent",
                                                    color: active
                                                        ? namePillBg
                                                        : namePillText,
                                                }}
                                            >
                                                {sf.name}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Style pill dropdown */}
                    <div
                        ref={stylePillRef}
                        style={{
                            ...stylePillStyleBase,
                            cursor:
                                styleNames.length > 1 ? "pointer" : "default",
                        }}
                        onMouseDown={
                            styleNames.length > 1
                                ? (e) => {
                                      e.preventDefault()
                                      setStyleMenuOpen((v) => !v)
                                  }
                                : undefined
                        }
                    >
                        <span style={{ paddingTop: 2 }}>
                            {displayStyle(selectedStyle)}
                        </span>
                        {styleNames.length > 1 && (
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transform: styleMenuOpen
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                    transition: "transform 0.25s ease",
                                }}
                            >
                                <svg width="12" height="7" viewBox="0 0 12 7">
                                    <polyline
                                        points="1,1 6,6 11,1"
                                        stroke="currentColor"
                                        strokeWidth="1"
                                        strokeLinecap="square"
                                        fill="none"
                                    />
                                </svg>
                            </span>
                        )}
                        {styleNames.length > 1 && (
                            <div style={styleMenuWrapStyle}>
                                <div style={styleMenuListStyle}>
                                    {styleNames.map((s) => {
                                        const active = s === selectedStyle
                                        return (
                                            <div
                                                key={s}
                                                onMouseDown={(e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    userTouchedRef.current = true
                                                    setSelectedStyle(s)
                                                    setStyleMenuOpen(false)
                                                }}
                                                style={{
                                                    padding: "6px 16px",
                                                    cursor: "pointer",
                                                    fontSize: 16,
                                                    lineHeight: "22.4px",
                                                    whiteSpace: "nowrap",
                                                    background: active
                                                        ? stylePillText
                                                        : "transparent",
                                                    color: active
                                                        ? stylePillBg
                                                        : stylePillText,
                                                }}
                                            >
                                                {displayStyle(s)}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Active OpenType features — rendered next to the
                        style dropdown in the same UI font. Joined with
                        ", " (no trailing comma). Empty when no feature
                        is currently active. */}
                    {activeFeatures.size > 0 && (
                        <span
                            style={{
                                display: "flex",
                                alignItems: "center",
                                paddingLeft: 16,
                                paddingTop: 2,
                                fontFamily: uiFontChain,
                                fontSize: 16,
                                fontWeight: 400,
                                lineHeight: "22.4px",
                                color: foreground,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {Array.from(activeFeatures).join(", ")}
                        </span>
                    )}
                </div>

                {/* Shuffle pill — right-aligned. Same shape as the
                    style pill. Whole pill is clickable. */}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="Shuffle"
                    title="Shuffle"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        shuffle()
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            shuffle()
                        }
                    }}
                    style={shufflePillStyle}
                >
                    <span style={{ paddingTop: 2 }}>Shuffle</span>
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        style={{ pointerEvents: "none" }}
                    >
                        <polyline points="16 3 21 3 21 8" />
                        <line x1="4" y1="20" x2="21" y2="3" />
                        <polyline points="21 16 21 21 16 21" />
                        <line x1="15" y1="15" x2="21" y2="21" />
                        <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                </div>
            </div>

            {/* Specimen lines. `flex: 1 1 0; min-height: 0` lets this
                div soak up every pixel of leftover vertical space.
                Font size is written onto each line by the layout
                effect above, derived from the root's clientHeight. */}
            <div
                style={{
                    padding: `0 ${padding}px`,
                    boxSizing: "border-box",
                    flex: "1 1 0",
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-start",
                    overflow: "visible",
                }}
            >
                <div ref={line1Ref} style={lineStyle}>
                    {line1}
                </div>
                <div ref={line2Ref} style={lineStyle}>
                    {line2}
                </div>
            </div>
            {debugSize && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        padding: "4px 8px",
                        background: "rgba(255, 0, 128, 0.9)",
                        color: "white",
                        fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 11,
                        lineHeight: 1.4,
                        borderRadius: 4,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        zIndex: 9999,
                    }}
                >
                    rootH: {Math.round(dbgRootH)}px · fontSize:{" "}
                    {Math.round(dbgFs)}px
                </div>
            )}
        </div>
    )
}

Specimen.defaultProps = {
    slug1: "cina-geo-standard",
    slug2: "cina-geo-mono",
    slug3: "cina-geo-display",
    slug4: "",
    slug5: "",
    slug6: "",
    line1: "AaBb",
    line2: "12345",
    sizeRatio: 1,
    specimenLineHeight: 0.95,
    foreground: "#FFFFFF",
    background: "#000000",
    backgroundImage: "",
    accent: "#FFFFFF",
    accentForeground: "",
    stylePillColor: "#FFFFFF",
    stylePillForeground: "",
    shufflePillColor: "#FFFFFF",
    shufflePillForeground: "#000000",
    padding: 24,
    controlsGap: 24,
    fontdueUrl: "https://www.publictype.us",
    debugSize: false,
}

addPropertyControls(Specimen, {
    slug1: {
        type: ControlType.String,
        title: "Slug #1",
        defaultValue: "cina-geo-standard",
        description:
            "Fontdue slug — child, super family (auto-picks first non-variable child), or standalone family. CMS-bindable.",
    },
    slug2: {
        type: ControlType.String,
        title: "Slug #2",
        defaultValue: "cina-geo-mono",
        description: "Optional additional slug. CMS-bindable.",
    },
    slug3: {
        type: ControlType.String,
        title: "Slug #3",
        defaultValue: "cina-geo-display",
        description: "Optional additional slug. CMS-bindable.",
    },
    slug4: {
        type: ControlType.String,
        title: "Slug #4",
        defaultValue: "",
        description: "Optional additional slug. CMS-bindable.",
    },
    slug5: {
        type: ControlType.String,
        title: "Slug #5",
        defaultValue: "",
        description: "Optional additional slug. CMS-bindable.",
    },
    slug6: {
        type: ControlType.String,
        title: "Slug #6",
        defaultValue: "",
        description: "Optional additional slug. CMS-bindable.",
    },
    line1: {
        type: ControlType.String,
        title: "Line 1",
        defaultValue: "AaBb",
        description: "Top line content (CMS-bindable)",
    },
    line2: {
        type: ControlType.String,
        title: "Line 2",
        defaultValue: "12345",
        description: "Bottom line content (CMS-bindable)",
    },
    sizeRatio: {
        type: ControlType.Number,
        title: "Size",
        defaultValue: 1,
        min: 0.1,
        max: 1.5,
        step: 0.01,
        description:
            "Scale of the height-fit. 1 fills the frame; <1 leaves breathing room, >1 bleeds past.",
    },
    specimenLineHeight: {
        type: ControlType.Number,
        title: "Leading",
        defaultValue: 0.95,
        min: 0.5,
        max: 2,
        step: 0.01,
    },
    foreground: {
        type: ControlType.Color,
        title: "Foreground",
        defaultValue: "#FFFFFF",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#000000",
    },
    backgroundImage: {
        type: ControlType.Image,
        title: "Background Image",
        description: "Optional background image (cover fill, CMS-bindable)",
    },
    accent: {
        type: ControlType.Color,
        title: "Name Pill BG",
        defaultValue: "#FFFFFF",
        description: "Font name pill background (CMS-bindable)",
    },
    accentForeground: {
        type: ControlType.Color,
        title: "Name Pill FG",
        description:
            "Font name pill text color. Leave empty for auto-contrast against the background.",
    },
    stylePillColor: {
        type: ControlType.Color,
        title: "Style Pill BG",
        defaultValue: "#FFFFFF",
        description: "Style dropdown pill background (CMS-bindable)",
    },
    stylePillForeground: {
        type: ControlType.Color,
        title: "Style Pill FG",
        description:
            "Style dropdown pill text color. Leave empty for auto-contrast against the background.",
    },
    shufflePillColor: {
        type: ControlType.Color,
        title: "Shuffle Pill BG",
        defaultValue: "#FFFFFF",
        description: "Shuffle pill background (CMS-bindable)",
    },
    shufflePillForeground: {
        type: ControlType.Color,
        title: "Shuffle Pill FG",
        defaultValue: "#000000",
        description: "Shuffle pill text + icon color (CMS-bindable)",
    },
    padding: {
        type: ControlType.Number,
        title: "Padding",
        defaultValue: 24,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        description: "Inner padding on all four sides",
    },
    controlsGap: {
        type: ControlType.Number,
        title: "Controls Gap",
        defaultValue: 24,
        min: 0,
        max: 400,
        step: 1,
        unit: "px",
        description:
            "Gap between the top eyebrow controls and the specimen text",
    },
    fontdueUrl: {
        type: ControlType.String,
        title: "Fontdue URL",
        defaultValue: "https://www.publictype.us",
        description: "Your Fontdue site URL (no trailing slash)",
    },
    debugSize: {
        type: ControlType.Boolean,
        title: "Debug Size",
        enabledTitle: "Show",
        disabledTitle: "Hide",
        defaultValue: false,
        description:
            "Show the measured root height + computed font-size in the corner. For diagnosing fill-height issues.",
    },
})

// ============================================================
// Helpers
// ============================================================

const DEFAULT_FEATURES = new Set([
    "liga",
    "kern",
    "calt",
    "ccmp",
    "rlig",
    "mark",
    "mkmk",
])

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
        const p = m[1].split(",").map((x) => parseFloat(x.trim()))
        if (p.length >= 3) return [p[0], p[1], p[2]]
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

// The Fontdue-hosted stylesheet for Cina Sans (the UI font). The URL
// is the same one Framer injects when a page uses Cina Sans as a text
// layer. Referencing it ourselves guarantees "Cina Sans Regular" and
// siblings are registered even on pages where Framer doesn't load it.
const UI_FONT_STYLESHEET =
    "https://fonts.fontdue.com/publictype/css/Rm9udENvbGxlY3Rpb246MTgyNjMzMDk2NzA5NTEyMDcwNw%3D%3D.css"
function ensureUIFontLoaded() {
    if (typeof document === "undefined") return
    if (document.querySelector('link[data-public-type-ui="true"]')) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = UI_FONT_STYLESHEET
    link.setAttribute("data-public-type-ui", "true")
    document.head.appendChild(link)
}

const INJECTED_FACE_KEYS = new Set<string>()
function injectFontFaces(cssRules: string, key: string) {
    if (typeof document === "undefined") return
    if (INJECTED_FACE_KEYS.has(key)) return
    INJECTED_FACE_KEYS.add(key)
    const style = document.createElement("style")
    style.setAttribute("data-fontdue-specimen", key)
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
