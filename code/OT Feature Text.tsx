import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * OT FEATURE TEXT
 *
 * Single-line specimen text with an OpenType feature applied. Scales
 * the font-size to the container's clientHeight (line-height 1) so
 * glyphs fill the frame vertically and bleed horizontally when wider
 * than the padded width. Top/left/right clipped at the frame edges,
 * bottom left unclipped so descenders bleed below.
 *
 * CMS-bindable:
 *   - Family slug
 *   - Style name (e.g. "Bold")
 *   - Content
 *   - Feature tag (empty = no feature applied)
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 360
 */

type StyleRec = {
    name: string
    cssFamily: string
    cssWeight: number
    fullFamily: string
    isItalic: boolean
}

type Props = {
    familySlug: string
    styleName: string
    content: string
    featureTag: string
    padding: number
    foreground: string
    background: string
    fontdueUrl: string
}

export default function OTFeatureText(props: Props) {
    const {
        familySlug,
        styleName,
        content,
        featureTag,
        padding,
        foreground,
        background,
        fontdueUrl,
    } = props

    const slug = (familySlug || "").trim().toLowerCase()
    const targetStyle = (styleName || "").trim().toLowerCase()
    const tag = (featureTag || "").trim().toLowerCase()

    const [styles, setStyles] = React.useState<StyleRec[]>([])
    const [childName, setChildName] = React.useState("")
    const [fontsLoaded, setFontsLoaded] = React.useState(false)

    const activeStyle = React.useMemo<StyleRec | null>(() => {
        if (styles.length === 0) return null
        if (targetStyle) {
            const hit = styles.find(
                (s) =>
                    s.name.toLowerCase() === targetStyle ||
                    s.fullFamily.toLowerCase() === targetStyle ||
                    s.name.toLowerCase().endsWith(` ${targetStyle}`)
            )
            if (hit) return hit
        }
        return (
            styles.find((s) => /^regular$/i.test(s.name)) ||
            styles.find((s) => !s.isItalic) ||
            styles[0]
        )
    }, [styles, targetStyle])

    const fontFeatureSettings = tag ? `'${tag}' 1` : "normal"

    React.useEffect(() => {
        if (!slug) {
            setStyles([])
            setChildName("")
            setFontsLoaded(true)
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
            name cssFamily cssWeight cssStyle
            webfontSources { format url }
            variableAxes { axis }
          }
          children {
            name slug { name }
            fontStyles {
              name cssFamily cssWeight cssStyle
              webfontSources { format url }
              variableAxes { axis }
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

                let resolvedChild: any = null
                let superNode: any = null

                const child = nodes.find(
                    (n) =>
                        (n?.slug?.name || "").toLowerCase() === slug &&
                        n?.parent?.slug?.name
                )
                if (child) {
                    resolvedChild = child
                    const parentSlug = child.parent.slug.name
                        .toLowerCase()
                        .trim()
                    superNode = nodes.find(
                        (n) =>
                            n?.collectionType === "superfamily" &&
                            (n?.slug?.name || "").toLowerCase() === parentSlug
                    )
                } else {
                    const sup = nodes.find(
                        (n) =>
                            n?.collectionType === "superfamily" &&
                            (n?.slug?.name || "").toLowerCase() === slug
                    )
                    if (sup) {
                        superNode = sup
                        const kids = (sup.children || []).filter(
                            (c: any) =>
                                (c?.fontStyles?.length || 0) > 0 &&
                                !/variable|\bvf\b/i.test(c?.name || "")
                        )
                        resolvedChild =
                            kids[0] ||
                            (sup.children || []).find(
                                (c: any) => (c?.fontStyles?.length || 0) > 0
                            )
                    } else {
                        const plain = nodes.find(
                            (n) =>
                                (n?.slug?.name || "").toLowerCase() === slug &&
                                (n?.fontStyles?.length || 0) > 0
                        )
                        if (plain) {
                            resolvedChild = {
                                name: plain.name,
                                slug: plain.slug,
                                fontStyles: plain.fontStyles || [],
                            }
                            superNode = {
                                name: plain.name,
                                slug: plain.slug,
                                children: [resolvedChild],
                            }
                        }
                    }
                }

                if (!resolvedChild) {
                    setFontsLoaded(true)
                    return
                }

                const rules: string[] = []
                const walkFaces = (list: any[]) => {
                    for (const s of list || []) {
                        if ((s.variableAxes || []).length > 0) continue
                        const cssFamily = s.cssFamily || ""
                        const fullFamily =
                            cssFamily && s.name
                                ? `${cssFamily} ${s.name}`
                                : cssFamily
                        const sources = s.webfontSources || []
                        if (fullFamily && sources.length > 0) {
                            rules.push(buildFontFaceCss(fullFamily, sources))
                        }
                    }
                }
                if (superNode) {
                    for (const c of superNode.children || []) {
                        walkFaces(c.fontStyles || [])
                    }
                    walkFaces(superNode.fontStyles || [])
                } else {
                    walkFaces(resolvedChild.fontStyles || [])
                }
                const superSlug =
                    (superNode?.slug?.name || resolvedChild?.slug?.name || "")
                        .toLowerCase()
                        .trim() || slug
                if (rules.length > 0) {
                    injectFontFaces(rules.join("\n"), `fontdue:${superSlug}`)
                }

                const out: StyleRec[] = []
                for (const s of resolvedChild.fontStyles || []) {
                    if ((s.variableAxes || []).length > 0) continue
                    const cssFamily = s.cssFamily || ""
                    const fullFamily =
                        cssFamily && s.name
                            ? `${cssFamily} ${s.name}`
                            : cssFamily
                    out.push({
                        name: s.name,
                        cssFamily,
                        cssWeight: parseInt(s.cssWeight, 10) || 400,
                        fullFamily,
                        isItalic:
                            /italic/i.test(s.name) ||
                            /italic/i.test(s.cssStyle || ""),
                    })
                }
                setChildName(resolvedChild.name || "")
                setStyles(out)

                const fonts: FontFaceSet | undefined =
                    typeof document !== "undefined"
                        ? (document as any).fonts
                        : undefined
                const reveal = () => {
                    if (!cancelled) setFontsLoaded(true)
                }
                if (fonts && out.length > 0) {
                    Promise.all(
                        out.map((s) =>
                            fonts
                                .load(`100px "${s.fullFamily}"`)
                                .catch(() => null)
                        )
                    ).then(reveal)
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

    // Height-fit: fontSize = container clientHeight, line-height 1.
    const displayRef = React.useRef<HTMLDivElement>(null)
    const textRef = React.useRef<HTMLDivElement>(null)
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
    }, [padding, fontsLoaded])

    const familyChain = activeStyle
        ? `'${activeStyle.fullFamily}', sans-serif`
        : "sans-serif"

    return (
        <div
            ref={displayRef}
            style={{
                width: "100%",
                height: "100%",
                flex: "1 1 auto",
                alignSelf: "stretch",
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                padding: `0 ${padding}px`,
                background,
                boxSizing: "border-box",
                overflow: "visible",
                opacity: fontsLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            <div
                ref={textRef}
                style={{
                    fontFamily: familyChain,
                    fontStyle: "normal",
                    fontWeight: activeStyle?.cssWeight || 400,
                    color: foreground,
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    fontFeatureSettings,
                    overflow: "visible",
                }}
            >
                {content}
            </div>
        </div>
    )
}

OTFeatureText.defaultProps = {
    familySlug: "cina-geo-standard",
    styleName: "Bold",
    content: "Handgloves",
    featureTag: "ss01",
    padding: 24,
    foreground: "#000000",
    background: "#F2F2F2",
    fontdueUrl: "https://www.publictype.us",
}

addPropertyControls(OTFeatureText, {
    familySlug: {
        type: ControlType.String,
        title: "Family",
        defaultValue: "cina-geo-standard",
        description:
            "Fontdue slug — child, super-family, or standalone. CMS-bindable.",
    },
    styleName: {
        type: ControlType.String,
        title: "Style",
        defaultValue: "Bold",
        description: "Static style name. CMS-bindable.",
    },
    content: {
        type: ControlType.String,
        title: "Content",
        defaultValue: "Handgloves",
        description: "Display text (single line). CMS-bindable.",
        displayTextArea: true,
    },
    featureTag: {
        type: ControlType.String,
        title: "OT Feature",
        defaultValue: "ss01",
        description:
            "OT feature tag (e.g. ss01, dlig). Empty = no feature. CMS-bindable.",
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
    foreground: {
        type: ControlType.Color,
        title: "Foreground",
        defaultValue: "#000000",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#F2F2F2",
    },
    fontdueUrl: {
        type: ControlType.String,
        title: "Fontdue URL",
        defaultValue: "https://www.publictype.us",
    },
})

// ============================================================
// Helpers
// ============================================================

const INJECTED_FACE_KEYS = new Set<string>()
function injectFontFaces(cssRules: string, key: string) {
    if (typeof document === "undefined") return
    if (INJECTED_FACE_KEYS.has(key)) return
    INJECTED_FACE_KEYS.add(key)
    const style = document.createElement("style")
    style.setAttribute("data-fontdue-ot-text", key)
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
