import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * FAMILY LIST
 *
 * Renders every style from up to three Fontdue family slugs as a
 * flex-wrapped grid of labels, each set in the font it represents.
 * Labels flow left-to-right and wrap to new lines as the container
 * narrows. Font size is fixed and horizontal/vertical spacing between
 * items is independently tunable.
 *
 * Each slug is interpreted independently:
 *   • Super family slug ("cina-geo") → every child renders
 *   • Sub-family slug  ("cina-geo-mono") → only that child renders
 *   • Standalone family slug ("contro") → that family renders
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */

type WebfontSource = { format: string; url: string }

type FontStyle = {
    name: string
    cssFamily: string
    cssWeight?: string
    cssStyle?: string
    webfontSources?: WebfontSource[] | null
    variableAxes?: Array<{ axis: string }> | null
}

type CollectionNode = {
    name: string
    slug?: { name: string } | null
    collectionType?: string
    parent?: { slug?: { name: string } | null } | null
    fontStyles?: FontStyle[] | null
    children?: Array<{
        name: string
        slug?: { name: string } | null
        fontStyles?: FontStyle[] | null
    }> | null
}

const QUERY = `{
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
            }
          }
        }
      }
    }
  }
}`

// @font-face injector — registers every style in the super family under
// its unique `${cssFamily} ${styleName}` identifier via webfontSources
// URLs. Bypasses Fontdue's referer-gated cssUrl stylesheet entirely
// (that URL returns HTML when fetched from Framer).
const INJECTED_FACE_KEYS = new Set<string>()
function injectFontFaces(cssRules: string, key: string) {
    if (typeof document === "undefined") return
    if (INJECTED_FACE_KEYS.has(key)) return
    INJECTED_FACE_KEYS.add(key)
    const style = document.createElement("style")
    style.setAttribute("data-fontdue-familylist", key)
    style.textContent = cssRules
    document.head.appendChild(style)
}
function buildFontFaceCss(family: string, sources: WebfontSource[]): string {
    const ordered = [...sources].sort((a, b) => {
        const score = (f: string) => (f === "woff2" ? 0 : f === "woff" ? 1 : 2)
        return score(a.format) - score(b.format)
    })
    const srcList = ordered
        .map((s) => `url("${s.url}") format("${s.format}")`)
        .join(", ")
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:100 900;font-display:swap;src:local(""),${srcList};}`
}

export default function FamilyList(props: {
    slug1: string
    slug2: string
    slug3: string
    fontdueUrl: string
    color: string
    background: string
    padding: number
    fontSize: number
    rowGap: number
    lineHeight: number
    includeVariableFonts: boolean
    labelStyle: "full" | "style-only"
    showHeader: boolean
    headerSize: number
    headerGap: number
}) {
    const {
        slug1,
        slug2,
        slug3,
        fontdueUrl,
        color,
        background,
        padding,
        fontSize,
        rowGap,
        lineHeight,
        includeVariableFonts,
        labelStyle,
        showHeader,
        headerSize,
        headerGap,
    } = props

    // Active slug list (trimmed, non-empty, de-duped while preserving order)
    const slugs = React.useMemo(() => {
        const seen = new Set<string>()
        const out: string[] = []
        for (const raw of [slug1, slug2, slug3]) {
            const s = (raw || "").trim().toLowerCase()
            if (!s || seen.has(s)) continue
            seen.add(s)
            out.push(s)
        }
        return out
    }, [slug1, slug2, slug3])
    const slugsKey = slugs.join("|")

    const [styles, setStyles] = React.useState<
        Array<{ label: string; family: string }>
    >([])
    const [heading, setHeading] = React.useState<{
        text: string
        family: string
    } | null>(null)
    // Lazy-load gate: hide the whole list until every registered
    // family has actually downloaded. Without this, the list paints
    // with system fallback fonts while the woff2s fly in, which
    // looks like a flash of three different typefaces in a row.
    const [fontsLoaded, setFontsLoaded] = React.useState(false)

    // ---- Fetch + inject @font-face ----
    React.useEffect(() => {
        if (slugs.length === 0) {
            setStyles([])
            setHeading(null)
            return
        }
        let cancelled = false
        fetch(`${fontdueUrl}/graphql`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: QUERY }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return
                const edges: Array<{ node: CollectionNode }> =
                    data?.data?.viewer?.fontCollections?.edges || []
                const nodes = edges.map((e) => e.node)

                // Resolve each slug to {superNode, renderFilter}:
                //   - Super family slug → renderFilter = null (all children)
                //   - Child slug → walk up to super, filter to just that child
                //   - Standalone → synthesize a one-child super, render that child
                type Resolved = {
                    superNode: CollectionNode
                    renderChildSlug: string | null
                }
                const resolved: Resolved[] = []
                for (const target of slugs) {
                    const directSuper = nodes.find(
                        (n) =>
                            n.collectionType === "superfamily" &&
                            (n.slug?.name || "").toLowerCase() === target
                    )
                    if (directSuper) {
                        resolved.push({
                            superNode: directSuper,
                            renderChildSlug: null,
                        })
                        continue
                    }
                    const childNode = nodes.find(
                        (n) =>
                            (n.slug?.name || "").toLowerCase() === target &&
                            n.parent?.slug?.name
                    )
                    if (childNode?.parent?.slug?.name) {
                        const parentSlug = childNode.parent.slug.name
                            .toLowerCase()
                            .trim()
                        const sup = nodes.find(
                            (n) =>
                                n.collectionType === "superfamily" &&
                                (n.slug?.name || "").toLowerCase() ===
                                    parentSlug
                        )
                        if (sup) {
                            resolved.push({
                                superNode: sup,
                                renderChildSlug: target,
                            })
                            continue
                        }
                    }
                    // Standalone family fallback
                    const plain = nodes.find(
                        (n) =>
                            (n.slug?.name || "").toLowerCase() === target &&
                            (n.fontStyles?.length || 0) > 0
                    )
                    if (plain) {
                        resolved.push({
                            superNode: {
                                ...plain,
                                children: [
                                    {
                                        name: plain.name,
                                        slug: plain.slug,
                                        fontStyles: plain.fontStyles || [],
                                    },
                                ],
                            },
                            renderChildSlug:
                                (plain.slug?.name || "").toLowerCase() || null,
                        })
                    }
                }

                if (resolved.length === 0) return

                // Heading: derive from the first resolved slug. Text is
                // the child name when a specific sub-family was picked,
                // otherwise the super family name. Family is the Medium
                // weight from the super family (falls back to Regular,
                // then to the first available non-italic style).
                const first = resolved[0]
                const firstSuper = first.superNode
                const findHeaderStyle = (
                    sup: CollectionNode,
                    childSlug: string | null
                ): { cssFamily: string; name: string } | null => {
                    // Scope the search: if a specific child slug was
                    // passed, look only inside that child so the header
                    // is set in THAT sub-family's Medium (e.g. Mono or
                    // Display), not the super family's default child.
                    const children = (sup.children || []).filter((c) => {
                        if (childSlug) {
                            return (
                                (c.slug?.name || "").toLowerCase() === childSlug
                            )
                        }
                        return !/variable|\bvf\b/i.test(c.name || "")
                    })
                    const candidates = [/^medium$/i, /^regular$/i, /^book$/i]
                    for (const pattern of candidates) {
                        for (const c of children) {
                            for (const st of c.fontStyles || []) {
                                if (pattern.test(st.name)) {
                                    return {
                                        cssFamily: st.cssFamily || "",
                                        name: st.name,
                                    }
                                }
                            }
                        }
                    }
                    // Last resort: first non-italic style we can find
                    for (const c of children) {
                        for (const st of c.fontStyles || []) {
                            if (!/italic/i.test(st.name)) {
                                return {
                                    cssFamily: st.cssFamily || "",
                                    name: st.name,
                                }
                            }
                        }
                    }
                    return null
                }
                let headingText = firstSuper.name || ""
                if (first.renderChildSlug) {
                    const childMatch = (firstSuper.children || []).find(
                        (c) =>
                            (c.slug?.name || "").toLowerCase() ===
                            first.renderChildSlug
                    )
                    if (childMatch?.name) headingText = childMatch.name
                }
                const headerStyleInfo = findHeaderStyle(
                    firstSuper,
                    first.renderChildSlug
                )
                const headingFamily = headerStyleInfo
                    ? `${headerStyleInfo.cssFamily} ${headerStyleInfo.name}`.trim()
                    : ""
                setHeading(
                    headingText
                        ? { text: headingText, family: headingFamily }
                        : null
                )

                // Inject @font-face per unique super (dedup by slug).
                const injectedSupers = new Set<string>()
                const collected: Array<{
                    label: string
                    family: string
                }> = []
                const seenFamilies = new Set<string>()

                for (const { superNode, renderChildSlug } of resolved) {
                    const superSlug =
                        (superNode.slug?.name || "").toLowerCase().trim() ||
                        superNode.name
                    // Variable styles register under just `cssFamily`
                    // (e.g. "Cina GEO Variable"); appending the style
                    // name would double the word. Static styles use
                    // `${cssFamily} ${styleName}`.
                    const fullFamilyOf = (st: FontStyle) => {
                        const isVar = (st.variableAxes || []).length > 0
                        const base = (st.cssFamily || "").trim()
                        return isVar ? base : `${base} ${st.name}`.trim()
                    }
                    if (!injectedSupers.has(superSlug)) {
                        injectedSupers.add(superSlug)
                        const faceRules: string[] = []
                        for (const child of superNode.children || []) {
                            for (const st of child.fontStyles || []) {
                                const family = fullFamilyOf(st)
                                const sources = st.webfontSources || []
                                if (family && sources.length > 0) {
                                    faceRules.push(
                                        buildFontFaceCss(family, sources)
                                    )
                                }
                            }
                        }
                        if (faceRules.length > 0) {
                            injectFontFaces(
                                faceRules.join("\n"),
                                `fontdue:${superSlug}`
                            )
                        }
                    }

                    // Render list for this slug
                    for (const child of superNode.children || []) {
                        const childSlug = (child.slug?.name || "").toLowerCase()
                        if (renderChildSlug) {
                            if (childSlug !== renderChildSlug) continue
                        } else {
                            // Skip whole child when the sub-family is
                            // a variable shell (name contains VF/
                            // "Variable"). We still filter per-style
                            // below in case a non-variable-named child
                            // hosts variable styles.
                            const childIsVariable = /variable|\bvf\b/i.test(
                                child.name
                            )
                            if (!includeVariableFonts && childIsVariable)
                                continue
                        }
                        for (const st of child.fontStyles || []) {
                            const styleIsVariable =
                                (st.variableAxes || []).length > 0
                            if (!includeVariableFonts && styleIsVariable)
                                continue
                            const family = fullFamilyOf(st)
                            if (seenFamilies.has(family)) continue
                            seenFamilies.add(family)
                            // For variable styles the family already
                            // reads as e.g. "Cina GEO Variable", so
                            // "style-only" can't just show `st.name`
                            // (which would be "Variable"). Fall back
                            // to showing the full family for those.
                            const label =
                                labelStyle === "style-only"
                                    ? styleIsVariable
                                        ? family
                                        : st.name
                                    : family
                            collected.push({ label, family })
                        }
                    }
                }
                setStyles(collected)

                // Wait for every @font-face in this list to actually
                // download, then unhide.
                const fonts: FontFaceSet | undefined =
                    typeof document !== "undefined"
                        ? (document as any).fonts
                        : undefined
                const reveal = () => {
                    if (!cancelled) setFontsLoaded(true)
                }
                if (fonts && collected.length > 0) {
                    Promise.all(
                        collected.map((s) =>
                            fonts.load(`48px "${s.family}"`).catch(() => null)
                        )
                    ).then(reveal)
                } else {
                    reveal()
                }
            })
            .catch(() => {
                // Network/query failure — reveal anyway, nothing
                // useful to hide for.
                if (!cancelled) setFontsLoaded(true)
            })
        // Safety net: reveal after 3s no matter what.
        const timeout = window.setTimeout(() => {
            if (!cancelled) setFontsLoaded(true)
        }, 3000)
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [slugsKey, fontdueUrl, includeVariableFonts, labelStyle])

    return (
        <div
            style={{
                background,
                padding,
                width: "100%",
                boxSizing: "border-box",
                color,
                opacity: fontsLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            {showHeader && heading && (
                <div
                    style={{
                        fontFamily: heading.family
                            ? `'${heading.family}', sans-serif`
                            : "sans-serif",
                        fontSize: headerSize,
                        lineHeight,
                        color,
                        marginBottom: headerGap,
                        whiteSpace: "nowrap",
                    }}
                >
                    {heading.text}
                </div>
            )}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    rowGap,
                }}
            >
                {styles.map((s, i) => (
                    <div
                        key={`${s.family}-${i}`}
                        style={{
                            fontFamily: `'${s.family}', sans-serif`,
                            fontSize,
                            lineHeight,
                            whiteSpace: "nowrap",
                            color,
                        }}
                    >
                        {s.label}
                    </div>
                ))}
            </div>
        </div>
    )
}

FamilyList.defaultProps = {
    slug1: "",
    slug2: "",
    slug3: "",
    fontdueUrl: "https://www.publictype.us",
    color: "#000000",
    background: "transparent",
    padding: 24,
    fontSize: 48,
    rowGap: 8,
    lineHeight: 1,
    includeVariableFonts: false,
    labelStyle: "style-only" as "style-only",
    showHeader: true,
    headerSize: 96,
    headerGap: 24,
}

addPropertyControls(FamilyList, {
    slug1: {
        type: ControlType.String,
        title: "Slug #1",
        defaultValue: "",
        description:
            "Fontdue slug. Super family shows all children; sub-family shows just that child. CMS-bindable.",
    },
    slug2: {
        type: ControlType.String,
        title: "Slug #2",
        defaultValue: "",
        description: "Optional additional slug. CMS-bindable.",
    },
    slug3: {
        type: ControlType.String,
        title: "Slug #3",
        defaultValue: "",
        description: "Optional additional slug. CMS-bindable.",
    },
    labelStyle: {
        type: ControlType.Enum,
        title: "Label",
        options: ["full", "style-only"],
        optionTitles: ["Full (Cina Sans Bold)", "Style only (Bold)"],
        defaultValue: "style-only",
        displaySegmentedControl: true,
    },
    showHeader: {
        type: ControlType.Boolean,
        title: "Header",
        enabledTitle: "Show",
        disabledTitle: "Hide",
        defaultValue: true,
        description:
            "Show the family name at the top, set in Medium (or Regular fallback).",
    },
    headerSize: {
        type: ControlType.Number,
        title: "Header Size",
        defaultValue: 96,
        min: 8,
        max: 600,
        step: 1,
        unit: "px",
        hidden: (p: any) => !p.showHeader,
    },
    headerGap: {
        type: ControlType.Number,
        title: "Header Gap",
        defaultValue: 24,
        min: 0,
        max: 400,
        step: 1,
        unit: "px",
        description: "Space between the header and the style list",
        hidden: (p: any) => !p.showHeader,
    },
    fontSize: {
        type: ControlType.Number,
        title: "Font Size",
        defaultValue: 48,
        min: 8,
        max: 400,
        step: 1,
        unit: "px",
    },
    rowGap: {
        type: ControlType.Number,
        title: "Row Gap",
        defaultValue: 8,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        description: "Vertical spacing between rows",
    },
    includeVariableFonts: {
        type: ControlType.Boolean,
        title: "VF",
        enabledTitle: "Include",
        disabledTitle: "Exclude",
        defaultValue: false,
        description:
            "Include variable font children (only applies to super family slugs)",
    },
    color: {
        type: ControlType.Color,
        title: "Color",
        defaultValue: "#000000",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "rgba(0,0,0,0)",
    },
    padding: {
        type: ControlType.Number,
        title: "Padding",
        defaultValue: 24,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
    },
    lineHeight: {
        type: ControlType.Number,
        title: "Leading",
        defaultValue: 1,
        min: 0.5,
        max: 2,
        step: 0.01,
    },
    fontdueUrl: {
        type: ControlType.String,
        title: "Fontdue URL",
        defaultValue: "https://www.publictype.us",
        description: "Your Fontdue site URL (no trailing slash)",
    },
})
