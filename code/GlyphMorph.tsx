import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * GLYPH MORPH
 *
 * Morphs through up to 8 uploaded SVGs using a gooey (metaball) filter:
 *   feGaussianBlur blurs the cross-fading shapes, then feColorMatrix
 *   re-thresholds alpha to a sharp edge. The blur is only ever visible
 *   inside the threshold band, so with a high enough contrast value
 *   you see clean edges AND a melty transition.
 *
 * Each glyph holds for a share of its step, then morphs into the next.
 * Square aspect ratio locked to the shorter axis of whatever Framer
 * hands the frame. One `color` prop re-tints every SVG in the set —
 * fills and strokes are stripped at load time and replaced with
 * `fill="currentColor"`.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 400
 */

type ParsedSvg = { viewBox: string; inner: string }

type Props = {
    svg1: string
    svg2: string
    svg3: string
    svg4: string
    svg5: string
    svg6: string
    svg7: string
    svg8: string
    color: string
    background: string
    stepDuration: number
    holdRatio: number
    blur: number
    contrast: number
}

let UID = 0

export default function GlyphMorph(props: Props) {
    const {
        svg1,
        svg2,
        svg3,
        svg4,
        svg5,
        svg6,
        svg7,
        svg8,
        color,
        background,
        stepDuration,
        holdRatio,
        blur,
        contrast,
    } = props

    // Per-instance filter ID so multiple GlyphMorphs on one page
    // don't share a single <filter id="...">.
    const filterId = React.useMemo(() => `glyph-morph-goo-${++UID}`, [])

    const urls = React.useMemo(
        () =>
            [svg1, svg2, svg3, svg4, svg5, svg6, svg7, svg8]
                .map((s) => (s || "").trim())
                .filter(Boolean),
        [svg1, svg2, svg3, svg4, svg5, svg6, svg7, svg8]
    )
    const urlsKey = urls.join("|")

    const [parsed, setParsed] = React.useState<ParsedSvg[]>([])

    React.useEffect(() => {
        let cancelled = false
        if (urls.length === 0) {
            setParsed([])
            return
        }
        Promise.all(
            urls.map((u) =>
                fetch(u)
                    .then((r) => r.text())
                    .then(parseAndStripSvg)
                    .catch(() => null)
            )
        ).then((rs) => {
            if (!cancelled) setParsed(rs.filter(Boolean) as ParsedSvg[])
        })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlsKey])

    // Square sizing — the frame Framer gives us isn't necessarily
    // square, so we take the min of width/height and center.
    const wrapperRef = React.useRef<HTMLDivElement>(null)
    const [size, setSize] = React.useState(0)
    React.useLayoutEffect(() => {
        const el = wrapperRef.current
        if (!el || typeof window === "undefined") return
        const measure = () => {
            const r = el.getBoundingClientRect()
            setSize(Math.max(0, Math.floor(Math.min(r.width, r.height))))
        }
        measure()
        let ro: ResizeObserver | null = null
        if ((window as any).ResizeObserver) {
            ro = new ResizeObserver(measure)
            ro.observe(el)
        }
        window.addEventListener("resize", measure)
        return () => {
            if (ro) ro.disconnect()
            window.removeEventListener("resize", measure)
        }
    }, [])

    // Animation — hold current glyph for `holdRatio` of the step,
    // then cross-fade into the next over the remainder. Cosine ease.
    const [frame, setFrame] = React.useState({ cur: 0, nxt: 0, morph: 0 })
    React.useEffect(() => {
        if (parsed.length === 0) return
        if (parsed.length === 1) {
            setFrame({ cur: 0, nxt: 0, morph: 0 })
            return
        }
        let raf = 0
        const start = performance.now()
        const dur = Math.max(0.3, stepDuration) * 1000
        const hold = Math.max(0, Math.min(0.95, holdRatio))
        const morphStart = dur * hold
        const tick = (now: number) => {
            const elapsed = now - start
            const step = Math.floor(elapsed / dur)
            const withinStep = elapsed - step * dur
            const cur = step % parsed.length
            const nxt = (step + 1) % parsed.length
            let morph = 0
            if (withinStep >= morphStart) {
                const t = (withinStep - morphStart) / (dur - morphStart)
                const clamped = Math.max(0, Math.min(1, t))
                morph = 0.5 - 0.5 * Math.cos(clamped * Math.PI)
            }
            setFrame((prev) =>
                prev.cur === cur &&
                prev.nxt === nxt &&
                Math.abs(prev.morph - morph) < 0.005
                    ? prev
                    : { cur, nxt, morph }
            )
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [parsed.length, stepDuration, holdRatio])

    const current = parsed[frame.cur] || null
    const next = parsed[frame.nxt] || null

    // Alpha threshold matrix. Multiplier T + offset -(T/2 - 1) puts
    // the 50%-crossover at input_alpha ≈ 0.5 - 1/T, and the band width
    // (fully transparent → fully opaque) is ~1/T of the input range.
    // Higher T = narrower band = crisper edges = less visible blur.
    const T = Math.max(5, contrast)
    const OFFSET = -(T / 2) + 1
    const colorMatrix = `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${T} ${OFFSET}`

    const effectiveColor = color && color.trim().length > 0 ? color : "#000000"

    return (
        <div
            ref={wrapperRef}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background,
                boxSizing: "border-box",
                overflow: "hidden",
            }}
        >
            {size > 0 && parsed.length > 0 && (
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="xMidYMid meet"
                    style={{
                        display: "block",
                        color: effectiveColor,
                        overflow: "visible",
                    }}
                >
                    <defs>
                        <filter
                            id={filterId}
                            x="-25%"
                            y="-25%"
                            width="150%"
                            height="150%"
                            colorInterpolationFilters="sRGB"
                        >
                            <feGaussianBlur
                                in="SourceGraphic"
                                stdDeviation={blur}
                            />
                            <feColorMatrix values={colorMatrix} />
                        </filter>
                    </defs>
                    <g filter={`url(#${filterId})`}>
                        {current && (
                            <GlyphLayer
                                parsed={current}
                                opacity={1 - frame.morph}
                            />
                        )}
                        {next && next !== current && (
                            <GlyphLayer
                                parsed={next}
                                opacity={frame.morph}
                            />
                        )}
                    </g>
                </svg>
            )}
        </div>
    )
}

function GlyphLayer({
    parsed,
    opacity,
}: {
    parsed: ParsedSvg
    opacity: number
}) {
    return (
        <svg
            x={0}
            y={0}
            width={100}
            height={100}
            viewBox={parsed.viewBox}
            preserveAspectRatio="xMidYMid meet"
            style={{ opacity }}
        >
            <g
                fill="currentColor"
                dangerouslySetInnerHTML={{ __html: parsed.inner }}
            />
        </svg>
    )
}

// Parse an SVG string, strip hardcoded fill/stroke on children, and
// return its viewBox + the serialized inner markup. Wrapped in
// <g fill="currentColor"> at render time so the component's `color`
// prop re-tints everything.
function parseAndStripSvg(text: string): ParsedSvg | null {
    if (
        typeof DOMParser === "undefined" ||
        typeof XMLSerializer === "undefined"
    )
        return null
    try {
        const doc = new DOMParser().parseFromString(text, "image/svg+xml")
        if (doc.getElementsByTagName("parsererror").length > 0) return null
        const root = doc.documentElement
        if (root.nodeName.toLowerCase() !== "svg") return null

        const viewBox =
            root.getAttribute("viewBox") ||
            `0 0 ${root.getAttribute("width") || "100"} ${root.getAttribute("height") || "100"}`

        // Strip any fill/stroke that isn't explicitly `none` so our
        // outer <g fill="currentColor"> actually applies. Keeping
        // `fill="none"` preserves intentional empty strokes (icon
        // outlines, etc.) — though those won't be tintable without
        // a stroke, that's a source-SVG limitation.
        const walk = (el: Element) => {
            const fill = el.getAttribute("fill")
            if (fill !== null && fill.toLowerCase() !== "none") {
                el.removeAttribute("fill")
            }
            const stroke = el.getAttribute("stroke")
            if (stroke !== null && stroke.toLowerCase() !== "none") {
                el.removeAttribute("stroke")
            }
            const style = el.getAttribute("style")
            if (style) {
                const kept = style
                    .split(";")
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0)
                    .filter((s) => {
                        const idx = s.indexOf(":")
                        if (idx < 0) return true
                        const prop = s.slice(0, idx).trim().toLowerCase()
                        const val = s.slice(idx + 1).trim().toLowerCase()
                        if (
                            (prop === "fill" || prop === "stroke") &&
                            val !== "none"
                        ) {
                            return false
                        }
                        return true
                    })
                    .join(";")
                if (kept) el.setAttribute("style", kept)
                else el.removeAttribute("style")
            }
            for (let i = 0; i < el.children.length; i++) walk(el.children[i])
        }
        for (let i = 0; i < root.children.length; i++) walk(root.children[i])

        const serializer = new XMLSerializer()
        let inner = ""
        for (let i = 0; i < root.childNodes.length; i++) {
            inner += serializer.serializeToString(root.childNodes[i])
        }
        return { viewBox, inner }
    } catch {
        return null
    }
}

GlyphMorph.defaultProps = {
    svg1: "",
    svg2: "",
    svg3: "",
    svg4: "",
    svg5: "",
    svg6: "",
    svg7: "",
    svg8: "",
    color: "#000000",
    background: "rgba(0,0,0,0)",
    stepDuration: 2,
    holdRatio: 0.6,
    blur: 6,
    contrast: 30,
}

const svgFileControl = (title: string) => ({
    type: ControlType.File as const,
    title,
    allowedFileTypes: ["svg"],
})

addPropertyControls(GlyphMorph, {
    svg1: svgFileControl("SVG 1"),
    svg2: svgFileControl("SVG 2"),
    svg3: svgFileControl("SVG 3"),
    svg4: svgFileControl("SVG 4"),
    svg5: svgFileControl("SVG 5"),
    svg6: svgFileControl("SVG 6"),
    svg7: svgFileControl("SVG 7"),
    svg8: svgFileControl("SVG 8"),
    color: {
        type: ControlType.Color,
        title: "Color",
        defaultValue: "#000000",
        description:
            "Single color applied to every SVG in the set. CMS-bindable.",
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "rgba(0,0,0,0)",
    },
    stepDuration: {
        type: ControlType.Number,
        title: "Step",
        defaultValue: 2,
        min: 0.3,
        max: 20,
        step: 0.1,
        unit: "s",
        description: "Time for one glyph to hold + morph into the next",
    },
    holdRatio: {
        type: ControlType.Number,
        title: "Hold",
        defaultValue: 0.6,
        min: 0,
        max: 0.95,
        step: 0.05,
        description:
            "Fraction of each step spent holding the glyph (rest is morph)",
    },
    blur: {
        type: ControlType.Number,
        title: "Blur",
        defaultValue: 6,
        min: 1,
        max: 25,
        step: 0.5,
        description: "Gaussian blur radius that drives the melt",
    },
    contrast: {
        type: ControlType.Number,
        title: "Contrast",
        defaultValue: 30,
        min: 5,
        max: 100,
        step: 1,
        description:
            "Alpha-threshold sharpness. Higher = crisper edges, less visible blur halo.",
    },
})
