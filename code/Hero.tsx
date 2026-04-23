import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * Turn a slug like "cina-geo" into a readable name "Cina Geo".
 * Used as a fallback when the Fontdue fetch fails or is still in flight.
 */
function slugToTitle(slug: string): string {
    if (!slug) return ""
    return slug
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
}

/**
 * HERO
 *
 * Simple reusable hero for typeface detail pages.
 * - Big display text auto-fits 80% of the component width,
 *   never taller than 80% of the component height
 * - Supports manual line breaks in the display text
 * - Defaults to collection name fetched from Fontdue
 * - Meta row at bottom: font name (left), styles count (right)
 * - Inherits foreground/background from CMS
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 900
 */
export default function Hero(props: {
    collectionSlug: string
    styleName: string
    displayText: string
    features: string
    foreground: string
    background: string
    backgroundMedia: string
    fontdueUrl: string
}) {
    const {
        collectionSlug,
        styleName,
        displayText,
        features,
        foreground,
        background,
        backgroundMedia,
        fontdueUrl,
    } = props

    // Infer media type from the URL — a lightweight heuristic is fine
    // here because Framer's File control restricts the extensions the
    // CMS can hand us anyway.
    const isVideo = /\.(mp4|webm|mov|ogg|ogv)(\?|#|$)/i.test(
        backgroundMedia || ""
    )
    const isImage = !!backgroundMedia && !isVideo

    const [collectionName, setCollectionName] = React.useState<string>("")
    const [resolvedFamily, setResolvedFamily] = React.useState<string>("")
    // Map from lowercase human-readable stylistic-set name (as it
    // appears in Fontdue / the type tester — e.g. "DOTS", "MERZ") to
    // the concrete OT feature tag (e.g. "ss07"). Rebuilt whenever the
    // resolved style changes because stylistic-set assignments are
    // per-style.
    const [featureNameMap, setFeatureNameMap] = React.useState<
        Record<string, string>
    >({})
    const [viewBox, setViewBox] = React.useState<string>("0 0 100 100")
    // Lazy-load gate — stays false until the specific @font-face
    // we're about to render has actually been downloaded. Keeps the
    // hero hidden during the flash-of-fallback window, so visitors
    // never see the text pop from `sans-serif` metrics into the
    // real font.
    const [fontsLoaded, setFontsLoaded] = React.useState(false)

    const textRef = React.useRef<SVGTextElement>(null)

    // Fetch collection data from Fontdue GraphQL AND inject the
    // @font-face rules ourselves. We deliberately don't rely on the
    // `<fontdue-type-testers>` custom element or on a local font of
    // the same name — both lead to the designer's machine rendering
    // with a locally-installed font file that doesn't match what
    // gets served to visitors.
    React.useEffect(() => {
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
              stylisticSetNames { featureName humanName }
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
                if (edges.length === 0) return
                const nodes: any[] = edges.map((e: any) => e.node)

                const target = (collectionSlug || "").toLowerCase().trim()

                // Resolve `collectionSlug` to a super-family node (or
                // a standalone family). Same resolution strategy as
                // Specimen/TypeTester so slugs behave consistently.
                let superNode: any = nodes.find(
                    (n) =>
                        n?.collectionType === "superfamily" &&
                        (n?.slug?.name || "").toLowerCase().trim() === target
                )
                if (!superNode) {
                    const childNode = nodes.find(
                        (n) =>
                            (n?.slug?.name || "").toLowerCase().trim() ===
                                target && n?.parent?.slug?.name
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
                                target && (n?.fontStyles?.length || 0) > 0
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
                                },
                            ],
                        }
                    }
                }
                if (!superNode) return

                setCollectionName(superNode.name || "")

                // Walk super + children, collect @font-face rules,
                // and build a map from (full-family / style-name) to
                // the concrete registered family identifier.
                const rules: string[] = []
                const allStyles: Array<{
                    name: string
                    cssFamily: string
                    fullFamily: string
                    stylisticSetNames: Array<{
                        featureName: string
                        humanName: string
                    }>
                }> = []
                const walk = (styles: any[]) => {
                    for (const s of styles || []) {
                        // Variable fonts are valid @font-face targets —
                        // the browser happily accepts a woff2 with a
                        // weight range. Skipping them meant collections
                        // distributed only as variable fonts produced
                        // zero rules and zero candidates, leaving the
                        // hero in sans-serif forever.
                        const cssFamily = s.cssFamily || ""
                        const fullFamily =
                            cssFamily && s.name
                                ? `${cssFamily} ${s.name}`
                                : cssFamily
                        const sources = s.webfontSources || []
                        if (!fullFamily || sources.length === 0) continue
                        rules.push(buildFontFaceCss(fullFamily, sources))
                        allStyles.push({
                            name: s.name,
                            cssFamily,
                            fullFamily,
                            stylisticSetNames:
                                s.fontFeatures?.stylisticSetNames || [],
                        })
                    }
                }
                for (const c of superNode.children || []) {
                    walk(c.fontStyles || [])
                }
                walk(superNode.fontStyles || [])

                if (rules.length > 0) {
                    const superSlug =
                        (superNode.slug?.name || "").toLowerCase().trim() ||
                        target
                    injectFontFaces(rules.join("\n"), `fontdue:${superSlug}`)
                }

                // Resolve the user-supplied `styleName` to a concrete
                // registered family. Accepts:
                //   • The exact full family ("Cina GEO Bold")
                //   • Plain style name ("Bold") — matches first style
                //     with that name in the super family
                const wanted = (styleName || "").trim()
                const norm = (s: string) =>
                    s.toLowerCase().replace(/\s+/g, " ").trim()
                let hit =
                    allStyles.find(
                        (s) => norm(s.fullFamily) === norm(wanted)
                    ) ||
                    allStyles.find((s) => norm(s.name) === norm(wanted)) ||
                    allStyles.find((s) =>
                        norm(s.fullFamily).endsWith(" " + norm(wanted))
                    )
                // Last-resort fallback: if the CMS-bound styleName
                // doesn't match anything in this collection (wrong
                // value, empty field, typo), render the first available
                // style rather than silently falling through to
                // sans-serif.
                if (!hit && allStyles.length > 0) hit = allStyles[0]
                if (hit) {
                    setResolvedFamily(hit.fullFamily)
                    const map: Record<string, string> = {}
                    for (const ss of hit.stylisticSetNames) {
                        if (ss.humanName && ss.featureName) {
                            map[ss.humanName.toLowerCase().trim()] =
                                ss.featureName
                        }
                    }
                    setFeatureNameMap(map)
                    // Wait for the actual font file to be ready, THEN
                    // unhide the hero. This prevents the "flash of
                    // fallback" where text paints at sans-serif
                    // metrics, measures at the wrong size, and then
                    // snaps.
                    const fonts: FontFaceSet | undefined =
                        typeof document !== "undefined"
                            ? (document as any).fonts
                            : undefined
                    const reveal = () => {
                        if (!cancelled) setFontsLoaded(true)
                    }
                    if (fonts) {
                        fonts
                            .load(`100px "${hit.fullFamily}"`)
                            .then(reveal)
                            .catch(reveal)
                    } else {
                        reveal()
                    }
                }
            })
            .catch(() => {
                // Network/query failure — reveal anyway so the hero
                // doesn't stay permanently blank.
                if (!cancelled) setFontsLoaded(true)
            })
        // Safety net: reveal after 3s no matter what, so a slow
        // network or a mis-typed slug can never leave a blank hero.
        const timeout = window.setTimeout(() => {
            if (!cancelled) setFontsLoaded(true)
        }, 3000)
        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [collectionSlug, fontdueUrl, styleName])

    // Build font-feature-settings. Accepts either raw OT tags
    // (e.g. "ss01") OR the human-readable stylistic-set names that
    // the type tester and the CMS use (e.g. "DOTS", "MERZ"). Human
    // names are resolved to tags via the per-style map fetched from
    // Fontdue; raw tags pass through unchanged.
    const featureList = features
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    const resolvedFeatures = featureList.map((f) => {
        const mapped = featureNameMap[f.toLowerCase()]
        return mapped || f
    })
    const fontFeatureSettings =
        resolvedFeatures.length > 0
            ? resolvedFeatures.map((f) => `'${f}' 1`).join(", ")
            : "normal"

    // Human-readable font name — fetched name wins, slug-to-title is fallback
    const prettyName = collectionName || slugToTitle(collectionSlug)

    // Display text: explicit prop overrides the pretty name
    const effectiveDisplay =
        displayText && displayText.trim().length > 0 ? displayText : prettyName

    // Split on newlines for multi-line support in SVG
    const displayLines = effectiveDisplay.split(/\r?\n/)

    // Measure SVG text bbox and set viewBox so preserveAspectRatio="meet"
    // scales glyphs to fit the inner 80% × 80% box. We gate the whole
    // effect on `fontsLoaded` — by the time this runs, the concrete
    // Fontdue font is guaranteed to be in use, so `getBBox()` reads
    // the right metrics and we never have to re-measure to fix a
    // wrong first value.
    React.useLayoutEffect(() => {
        if (!fontsLoaded) return
        const measure = () => {
            const node = textRef.current
            if (!node) return
            try {
                const b = node.getBBox()
                if (b.width > 0 && b.height > 0) {
                    setViewBox(`${b.x} ${b.y} ${b.width} ${b.height}`)
                }
            } catch (e) {}
        }
        measure()
        const onResize = () => measure()
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [effectiveDisplay, fontsLoaded, fontFeatureSettings])

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                padding: 24,
                boxSizing: "border-box",
                background,
                color: foreground,
                fontFamily: "'Cina Sans', sans-serif",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                // Fade the whole hero in once the real font is
                // downloaded — hides the FOUT entirely.
                opacity: fontsLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            {/* Background media layer — image or video, cover-fit,
                behind the display text. */}
            {isVideo && (
                <video
                    src={backgroundMedia}
                    autoPlay
                    muted
                    loop
                    playsInline
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        zIndex: 0,
                        pointerEvents: "none",
                    }}
                />
            )}
            {isImage && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${backgroundMedia})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        zIndex: 0,
                        pointerEvents: "none",
                    }}
                />
            )}

            {/* Display wrapper — fills remaining space, centers the 80% box */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 0,
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <div
                    style={{
                        width: "80%",
                        height: "80%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <svg
                        viewBox={viewBox}
                        preserveAspectRatio="xMidYMid meet"
                        style={{
                            width: "100%",
                            height: "100%",
                            display: "block",
                            overflow: "visible",
                        }}
                    >
                        <text
                            ref={textRef}
                            x={0}
                            y={0}
                            fontSize={100}
                            textAnchor="middle"
                            dominantBaseline="text-before-edge"
                            style={{
                                // Reference ONLY the @font-face-registered
                                // family name so we never fall through to a
                                // locally-installed font with the same name.
                                fontFamily: resolvedFamily
                                    ? `'${resolvedFamily}', sans-serif`
                                    : "sans-serif",
                                fontWeight: 400,
                                fill: foreground,
                                letterSpacing: "-0.01em",
                                fontFeatureSettings,
                            }}
                        >
                            {displayLines.map((line, i) => (
                                <tspan key={i} x={0} dy={i === 0 ? 0 : "1em"}>
                                    {line || " "}
                                </tspan>
                            ))}
                        </text>
                    </svg>
                </div>
            </div>
        </div>
    )
}

Hero.defaultProps = {
    collectionSlug: "cina-geo",
    styleName: "Cina GEO Bold",
    displayText: "",
    features: "",
    foreground: "#000000",
    background: "#9DFFD6",
    backgroundMedia: "",
    fontdueUrl: "https://www.publictype.us",
}

addPropertyControls(Hero, {
    collectionSlug: {
        type: ControlType.String,
        title: "Collection Slug",
        defaultValue: "cina-geo",
        description: "Fontdue collection slug",
    },
    styleName: {
        type: ControlType.String,
        title: "Style",
        defaultValue: "Cina GEO Bold",
        description: "Which weight/style to display",
    },
    displayText: {
        type: ControlType.String,
        title: "Display Text",
        defaultValue: "",
        description:
            "Leave empty to use collection name. Line breaks supported.",
        displayTextArea: true,
    },
    features: {
        type: ControlType.String,
        title: "OT Features",
        defaultValue: "",
        description: "Comma-separated (e.g. ss01, ss09)",
    },
    foreground: {
        type: ControlType.Color,
        title: "Foreground",
        defaultValue: "#000000",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#9DFFD6",
    },
    backgroundMedia: {
        type: ControlType.File,
        title: "Background Image/Video",
        allowedFileTypes: [
            "jpg",
            "jpeg",
            "png",
            "webp",
            "svg",
            "gif",
            "avif",
            "mp4",
            "webm",
            "mov",
            "ogg",
            "ogv",
        ],
        description:
            "Optional background image or video (cover-fit, CMS-bindable). Videos autoplay muted in a loop.",
    },
    fontdueUrl: {
        type: ControlType.String,
        title: "Fontdue URL",
        defaultValue: "https://www.publictype.us",
    },
})

// ============================================================
// @font-face injection — mirrors Specimen / TypeTester helpers.
// ============================================================

const INJECTED_FACE_KEYS = new Set<string>()
function injectFontFaces(cssRules: string, key: string) {
    if (typeof document === "undefined") return
    if (INJECTED_FACE_KEYS.has(key)) return
    INJECTED_FACE_KEYS.add(key)
    const style = document.createElement("style")
    style.setAttribute("data-fontdue-hero", key)
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
