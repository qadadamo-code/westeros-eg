// Adapted for Westeros from the 21st.dev component "Dish orbit carousel": no scroll pinning (arrows, keys, swipes, thumbnails), round photos, Arabic.
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { gsap } from "gsap"

/*
 * Dish Orbit Carousel: a smart-kitchen-display menu. The plated dish sits on
 * the left; changing dish swings it out over the top on a wide orbit while the
 * next plate swings in from the other side. The two-weight title wipes out and
 * back in (thin line from the right, heavy line from the left), the chef card
 * and its coloured rating badge cross-fade, and a pastel arc behind the scene
 * turns and takes the dish's colour. The page scroll drives it: the section
 * pins and each stretch of scroll brings the next dish, endlessly both ways.
 * Arrows, thumbnails, the side pager, arrow keys and swipes jump too.
 */

export type Dish = {
  /** The thin first title line. */
  title: string
  /** The heavy second title line. */
  subtitle: string
  /** Photo of the dish; shown round, like a plate. */
  image: string
  alt?: string
  /** Small line above the title. */
  eyebrow?: string
  /** Label under the thumbnail. Defaults to title + subtitle. */
  label?: string
  /** Big figure on the card (the price) and the small unit beside it. */
  badge: string
  badgeUnit?: string
  /** First line of the card (the category) and the small line under it. */
  heading: string
  note?: string
  description: string
  /** Small facts under the description. */
  chips?: string[]
  ingredients?: string[]
  /** Badge and band colour: hex or rgb(), so the band can morph between dishes. */
  accent: string
}

export type DishOrbitLabels = { overview: string; ingredients: string; order: string; previous: string; next: string; region: string }

export type DishOrbitCarouselProps = {
  dishes: Dish[]
  /** Root height. A definite length. */
  height?: string
  /** Optional photo behind the display. Washed by the theme background. */
  backdrop?: string
  labels: DishOrbitLabels
  dir?: "rtl" | "ltr"
  onOrder?: (dish: Dish, index: number) => void
  onChange?: (index: number) => void
  className?: string
}

// #region carousel
export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0
  return ((Math.round(i) % n) + n) % n
}

/** Which way to swing when jumping from one dish to another: the shorter way round. */
export function stepDirection(from: number, to: number, n: number): 1 | -1 {
  if (n <= 0) return 1
  const fwd = (((to - from) % n) + n) % n
  return fwd <= n - fwd ? 1 : -1
}

/** First thumbnail shown in the strip window, keeping the current one in view. */
export function stripStart(index: number, n: number, visible: number): number {
  if (n <= visible) return 0
  return Math.max(0, Math.min(index - 1, n - visible))
}

/** Title font size so a line of `chars` characters fits `width` px at `em` average glyph width. */
export function fitSize(chars: number, max: number, width: number, em: number): number {
  return Math.min(max, width / (Math.max(1, chars) * em))
}
/**
 * The pastel band: a thick stroke along the plates' orbit circle, tapering at
 * both ends. Angles in degrees, screen space (0 = right, 90 = straight down).
 */
export function arcPath(a0: number, a1: number, cx: number, cy: number, r: number, w: number, steps = 48): string {
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180
    const h = (w / 2) * Math.pow(Math.sin(Math.PI * t), 0.45)
    const c = Math.cos(a)
    const s = Math.sin(a)
    outer.push((cx + c * (r + h)).toFixed(1) + " " + (cy + s * (r + h)).toFixed(1))
    inner.push((cx + c * (r - h)).toFixed(1) + " " + (cy + s * (r - h)).toFixed(1))
  }
  return "M" + outer.join("L") + "L" + inner.reverse().join("L") + "Z"
}

/** Where the band rests for each dish, as [start, end] angles along the orbit. Measured off the reference. */
export const ARC_REST = [[50, 98], [46, 124], [60, 126], [40, 100]]
export function arcRest(index: number): number[] {
  return ARC_REST[((index % ARC_REST.length) + ARC_REST.length) % ARC_REST.length]
}

/** The band mid-swap: it stretches to trail between the outgoing and incoming plate. */
export const ARC_SWEEP = [38, 146]
// #endregion

// The plates' orbit: its pivot sits above the canvas (the .dsh-orbit transform-origin).
const ORBIT_X = 299
const ORBIT_Y = -450
const ORBIT_R = 650
const SWING = 50 // degrees the plate travels round the orbit's pivot
const ITEM = 118 // thumbnail pitch in canvas px
const VISIBLE = 4

const CSS =
  ".dsh-root{position:relative;overflow:hidden;width:100%;background:var(--color-background);color:var(--color-foreground);" +
  "font-family:inherit;container-type:inline-size;-webkit-tap-highlight-color:transparent}" +
  ".dsh-root *{box-sizing:border-box}" +
  ".dsh-bd{position:absolute;inset:-6%;width:112%;height:112%;max-width:none;object-fit:cover;pointer-events:none;filter:blur(26px) saturate(1.2)}" +
  ".dsh-wash{position:absolute;inset:0;background:color-mix(in oklab,var(--color-background) 70%,transparent);pointer-events:none}" +
  // multiply by the background: a no-op on a light theme, lights-off on a dark one
  ".dsh-dim{position:absolute;inset:0;background:var(--color-background);mix-blend-mode:multiply;opacity:.72;pointer-events:none}" +
  ".dsh-root:focus-visible{outline:2px solid var(--color-primary);outline-offset:-4px}" +
  ".dsh-canvas{position:absolute;left:50%;top:50%;width:960px;height:520px;transform:translate(-50%,-50%) scale(var(--dsh-s,1));transform-origin:50% 50%}" +
  ".dsh-arc{position:absolute;left:0;top:0;width:960px;height:520px;overflow:visible;pointer-events:none}" +
  ".dsh-btn{appearance:none;border:0;background:none;color:inherit;font:inherit;padding:0;margin:0;cursor:pointer}" +
  ".dsh-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px;border-radius:10px}" +
  ".dsh-ico{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}" +
  ".dsh-pager{position:absolute;left:76px;top:172px;display:flex;flex-direction:column;align-items:center;gap:7px}" +
  ".dsh-dot{width:14px;height:10px;display:grid;place-items:center}" +
  ".dsh-dot i{display:block;width:3px;height:3px;border-radius:3px;background:var(--color-foreground);opacity:.45;transition:height .45s cubic-bezier(.3,.7,.2,1),opacity .3s}" +
  ".dsh-dot[aria-current] i{height:22px;opacity:.9}" +
  ".dsh-dot[aria-current]{height:26px}" +
  ".dsh-dot{transition:height .45s cubic-bezier(.3,.7,.2,1)}" +
  ".dsh-plates{position:absolute;left:130px;top:82px;width:245px;height:245px;touch-action:pan-y}" +
  ".dsh-orbit{position:absolute;inset:0;transform-origin:69% -217%;visibility:hidden;will-change:transform}" +
  ".dsh-orbit>img{display:block;width:245px;height:245px;max-width:none;object-fit:cover;border-radius:50%;background:var(--color-card);outline:3px solid color-mix(in oklab,var(--color-primary) 85%,transparent);outline-offset:5px;user-select:none;-webkit-user-drag:none;" +
  "box-shadow:0 22px 34px -10px rgba(0,0,0,.45),0 4px 8px rgba(0,0,0,.2)}" +
  ".dsh-head{position:absolute;left:388px;top:96px;width:330px;height:150px}" +
  ".dsh-hd{position:absolute;inset:0;visibility:hidden}" +
  ".dsh-eye{font-size:12.5px;font-weight:700;margin:0 2px 4px;color:var(--color-muted-foreground)}" +
  ".dsh-t1,.dsh-t2{display:block;white-space:nowrap;line-height:1.25;margin:0}" +
  ".dsh-t1{font-weight:300;margin-top:2px}" +
  ".dsh-t2{font-weight:800;margin-top:0;color:var(--color-primary)}" +
  ".dsh-acts{position:absolute;left:396px;top:280px;display:flex;gap:44px;font-size:12.5px;font-weight:500}" +
  ".dsh-acts .dsh-btn{display:flex;align-items:center;gap:9px;padding:9px 18px;border-radius:99px;background:var(--color-primary);color:var(--color-primary-foreground);font-weight:700;font-size:13px}" +
  ".dsh-acts .dsh-ico{width:13px;height:13px}" +
  ".dsh-acts .dsh-fill{fill:currentColor;stroke:none}" +
  ".dsh-card{position:absolute;left:722px;top:137px;width:223px;padding:18px 20px 20px;border-radius:20px;" +
  "background:color-mix(in oklab,var(--color-background) 72%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);" +
  "box-shadow:0 1px 0 color-mix(in oklab,var(--color-foreground) 6%,transparent) inset,0 18px 40px -24px rgba(0,0,0,.25)}" +
  ".dsh-tabs{display:flex;justify-content:space-between;padding:0 10px;font-size:12px;margin-bottom:20px}" +
  ".dsh-tab{color:var(--color-muted-foreground);font-weight:500;padding:3px 0}" +
  ".dsh-tab[aria-selected=true]{color:var(--color-foreground);font-weight:600}" +
  ".dsh-bodies{display:grid}" +
  ".dsh-body{grid-area:1/1;visibility:hidden}" +
  ".dsh-rate{position:relative;height:56px;margin:0 0 12px}" +
  ".dsh-badge{display:none;position:absolute;left:0;top:0;width:46px;height:62px;border-radius:10px}" +
  ".dsh-badge svg{position:absolute;left:17px;bottom:9px;width:12px;height:12px;fill:var(--color-foreground);opacity:.8}" +
  ".dsh-num{display:inline-block;font-size:32px;font-weight:800;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--color-primary);color:var(--color-primary-foreground);padding:10px 16px 8px;border-radius:16px;box-shadow:0 10px 22px -12px var(--color-primary)}.dsh-num small{font-size:12px;font-weight:700;margin-inline-start:6px;opacity:.75}" +
  ".dsh-chef{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0}" +
  ".dsh-kit{font-size:10.5px;color:var(--color-muted-foreground);margin:3px 0 12px}" +
  ".dsh-desc{font-size:12.5px;line-height:1.38;margin:0;min-height:52px}" +
  ".dsh-ing{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none;min-height:52px}" +
  ".dsh-ing li{font-size:11px;padding:4px 9px;border-radius:99px;background:color-mix(in oklab,var(--color-foreground) 7%,transparent)}" +
  ".dsh-react{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 0;padding:0;list-style:none}.dsh-react li{font-size:11px;font-weight:600;padding:5px 10px;border-radius:99px;background:color-mix(in oklab,var(--color-primary) 16%,transparent)}" +
  ".dsh-like{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 10px;border-radius:99px;font-size:10.5px;" +
  "background:color-mix(in oklab,var(--color-foreground) 6%,transparent);transition:background .25s}" +
  ".dsh-meh{width:34px;height:34px;display:grid;place-items:center;border-radius:99px;background:color-mix(in oklab,var(--color-foreground) 6%,transparent)}" +
  ".dsh-react .dsh-ico{width:16px;height:16px}" +
  ".dsh-react [aria-pressed=true] .dsh-ico{fill:currentColor}" +
  ".dsh-strip{position:absolute;left:130px;top:362px;width:550px;height:122px;display:flex;align-items:center}" +
  ".dsh-arrow{width:36px;height:36px;display:grid;place-items:center;flex:none}" +
  ".dsh-arrow svg{width:12px;height:16px;fill:currentColor}" +
  ".dsh-win{position:relative;width:" + ITEM * VISIBLE + "px;height:122px;overflow:hidden;flex:none;margin:0 2px;" +
  "-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}" +
  ".dsh-track{position:absolute;left:0;top:0;display:flex;transition:transform .6s cubic-bezier(.65,0,.35,1)}" +
  ".dsh-th{width:" + ITEM + "px;height:122px;display:flex;justify-content:center;padding-top:3px}" +
  ".dsh-th .dsh-btn{width:80px;height:116px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:7px;padding-top:9px;transition:background .45s}" +
  ".dsh-th .dsh-btn[aria-current]{background:color-mix(in oklab,var(--color-background) 62%,transparent);box-shadow:0 10px 24px -16px rgba(0,0,0,.3)}" +
  ".dsh-th img{width:56px;height:56px;max-width:none;object-fit:cover;border-radius:50%;box-shadow:0 4px 8px rgba(0,0,0,.25);transition:transform .45s}" +
  ".dsh-th .dsh-btn[aria-current] img{transform:scale(1.06)}" +
  ".dsh-th span{font-size:10.5px;line-height:1.3;text-align:center;font-weight:500;color:color-mix(in oklab,var(--color-foreground) 78%,transparent);max-width:78px}" +
  ".dsh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
  "@container (max-width:639px){" +
  ".dsh-canvas{position:relative;left:auto;top:auto;width:100%;height:auto;transform:none;display:flex;flex-direction:column;align-items:center;padding:var(--dsh-top,14px) 16px 18px}" +
  ".dsh-arc{width:200%;height:auto;left:-60%;top:-30px}" +
  ".dsh-pager{left:14px;top:150px}" +
  ".dsh-plates{position:relative;left:auto;top:auto;width:min(52vw,32svh);height:min(52vw,32svh);margin-top:0}" +
  ".dsh-orbit>img{width:100%;height:100%}" +
  ".dsh-head{position:relative;left:auto;top:auto;width:100%;height:132px;margin-top:10px}" +
  ".dsh-hd{text-align:center;transform:scale(.78);transform-origin:50% 0}" +
  ".dsh-acts{position:relative;left:auto;top:auto;margin-top:4px}" +
  ".dsh-card{position:relative;left:auto;top:auto;width:100%;max-width:420px;margin-top:12px}" +
  // phone: the pinned stage has to fit one screen; the pager, swipes and scroll cover the strip
  ".dsh-strip{display:none}" +
  "}" +
  "@media (prefers-reduced-motion:reduce){.dsh-track,.dsh-dot,.dsh-dot i,.dsh-th .dsh-btn,.dsh-th img,.dsh-like{transition:none}}"

const HIDE_1 = "inset(0% 0% 0% 100%)" // thin line: wipes in from the right
const HIDE_2 = "inset(0% 100% 0% 0%)" // heavy line: wipes in from the left
const SHOW = "inset(0% 0% 0% 0%)"

const Icon = {
  order: <svg className="dsh-ico dsh-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 3 15h18zM3 18h18v2.5H3z" /></svg>,
}

export function DishOrbitCarousel({
  dishes,
  height = "100svh",
  backdrop,
  labels,
  dir = "rtl",
  onOrder,
  onChange,
  className,
}: DishOrbitCarouselProps) {
  const n = dishes.length
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState("overview")

  const rootRef = useRef(null as HTMLDivElement | null)
  const indexRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const orbits = useRef([] as (HTMLDivElement | null)[])
  const heads = useRef([] as (HTMLDivElement | null)[])
  const bodies = useRef([] as (HTMLDivElement | null)[])
  const arcRef = useRef(null as SVGPathElement | null)
  const arc = useRef({ a0: 0, a1: 0 })
  const shown = useRef(-1)
  const dirRef = useRef(1 as 1 | -1)
  const tlRef = useRef(null as gsap.core.Timeline | null)
  const reducedRef = useRef(false)
  const swipe = useRef(null as { x: number; y: number } | null)

  // Fit the 960 x 520 design canvas to the root. Measured on resize only.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      el.style.setProperty("--dsh-s", String(Math.min(w / 960, h / 520, 1.6)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => (reducedRef.current = mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  // The swap. Every dish is in the DOM; GSAP only moves the outgoing and incoming ones.
  useLayoutEffect(() => {
    const from = shown.current
    const to = index
    const parts = (i: number) => {
      const head = heads.current[i]
      return {
        orbit: orbits.current[i],
        head,
        eye: head && head.querySelector(".dsh-eye"),
        t1: head && head.querySelector(".dsh-t1"),
        t2: head && head.querySelector(".dsh-t2"),
        body: bodies.current[i],
      }
    }
    // Writes the band's path only; no layout is read.
    const drawArc = () => arcRef.current?.setAttribute("d", arcPath(arc.current.a0, arc.current.a1, ORBIT_X, ORBIT_Y, ORBIT_R, 118))
    const rest = arcRest(to)
    const tint = dishes[to] ? dishes[to].accent : "transparent"
    if (tlRef.current) tlRef.current.progress(1).kill()
    const b = parts(to)
    if (from === -1 || from === to || reducedRef.current) {
      for (let i = 0; i < n; i++) if (i !== to) {
        const p = parts(i)
        gsap.set([p.orbit, p.head, p.body], { autoAlpha: 0 })
      }
      gsap.set([b.orbit, b.head, b.body, b.eye], { autoAlpha: 1, rotation: 0, y: 0 })
      gsap.set(b.t1, { clipPath: SHOW })
      gsap.set(b.t2, { clipPath: SHOW })
      arc.current.a0 = rest[0]
      arc.current.a1 = rest[1]
      drawArc()
      if (arcRef.current) gsap.set(arcRef.current, { fill: tint })
      shown.current = to
      return
    }
    const a = parts(from)
    const d = dirRef.current
    const tl = gsap.timeline({ onComplete: () => { tlRef.current = null } })
    tlRef.current = tl
    // plate: out over the top on the orbit, the next one swings in from the far side
    tl.to(a.orbit, { rotation: SWING * d, duration: 0.62, ease: "power2.in" }, 0)
      .set(a.orbit, { autoAlpha: 0, rotation: 0 }, 0.62)
      .fromTo(b.orbit, { autoAlpha: 1, rotation: -SWING * d }, { rotation: 0, duration: 0.95, ease: "power3.out" }, 0.3)
    // title: thin line clips away to the right, heavy line to the left, then the next wipes in
    tl.to(a.t1, { clipPath: HIDE_1, duration: 0.42, ease: "power2.in" }, 0)
      .to(a.t2, { clipPath: HIDE_2, duration: 0.42, ease: "power2.in" }, 0.06)
      .to(a.eye, { autoAlpha: 0, duration: 0.25 }, 0)
      .set(a.head, { autoAlpha: 0 }, 0.5)
      .set(b.head, { autoAlpha: 1 }, 0.5)
      .fromTo(b.eye, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.55)
      .fromTo(b.t1, { clipPath: HIDE_1 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.55)
      .fromTo(b.t2, { clipPath: HIDE_2 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.62)
    // card: cross-fade, the incoming rows rise in turn
    tl.to(a.body, { autoAlpha: 0, y: -6, duration: 0.3, ease: "power1.in" }, 0.05)
      .set(b.body, { autoAlpha: 1, y: 0 }, 0.4)
    if (b.body) tl.fromTo(b.body.children, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" }, 0.4)
    // the band stretches along the orbit with the plates, then settles into the next dish's span, morphing colour
    tl.to(arc.current, { a0: ARC_SWEEP[0], a1: ARC_SWEEP[1], duration: 0.6, ease: "power2.inOut", onUpdate: drawArc }, 0)
      .to(arc.current, { a0: rest[0], a1: rest[1], duration: 0.85, ease: "power3.out", onUpdate: drawArc }, 0.6)
    if (arcRef.current) tl.to(arcRef.current, { fill: tint, duration: 1.1, ease: "power1.inOut" }, 0.1)
    shown.current = to
  }, [index, n, dishes])

  useEffect(() => () => { tlRef.current?.kill() }, [])

  const select = (next: number, dir: 1 | -1) => {
    if (next === indexRef.current) return
    dirRef.current = dir
    indexRef.current = next
    setIndex(next)
    onChangeRef.current?.(next)
  }

  const go = (to: number, dir?: 1 | -1) => {
    if (n < 2) return
    const next = wrapIndex(to, n)
    if (next === index) return
    select(next, dir ?? stepDirection(index, next, n))
  }
  // a new set of dishes (another category) starts from its first plate
  useEffect(() => {
    shown.current = -1
    indexRef.current = 0
    setIndex(0)
  }, [dishes])
  const step = (d: 1 | -1) => go(index + d, d)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1) }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1) }
  }
  const onPointerDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.4) step(dx < 0 ? 1 : -1)
  }

  const start = stripStart(index, n, VISIBLE)
  const dish = dishes[index]

  return (
    <div
      ref={rootRef}
      className={"dsh-root" + (className ? " " + className : "")}
      style={{ height }}
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <style>{CSS}</style>
      {backdrop ? <img className="dsh-bd" src={backdrop} alt="" width={1200} height={900} /> : null}
      {backdrop ? <div className="dsh-dim" /> : null}
      {backdrop ? <div className="dsh-wash" /> : null}

      <div className="dsh-canvas">
        <svg className="dsh-arc" viewBox="0 0 960 520" aria-hidden="true">
          <path ref={arcRef} style={{ opacity: 0.34 }} />
        </svg>

        <div className="dsh-pager" role="tablist" aria-label={labels.region}>
          {dishes.map((d, i) => (
            <button key={i} type="button" role="tab" className="dsh-btn dsh-dot" aria-selected={i === index}
              aria-current={i === index ? "true" : undefined} aria-label={d.title + " " + d.subtitle} onClick={() => go(i)}>
              <i />
            </button>
          ))}
        </div>

        <div className="dsh-plates" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
          {dishes.map((d, i) => (
            <div key={i} ref={(el) => { orbits.current[i] = el }} className="dsh-orbit" aria-hidden={i !== index}>
              <img src={d.image} alt={d.alt ?? d.title + " " + d.subtitle} width={245} height={245} draggable={false} />
            </div>
          ))}
        </div>

        <div className="dsh-head" aria-live="polite" dir={dir}>
          {dishes.map((d, i) => (
            <div key={i} ref={(el) => { heads.current[i] = el }} className="dsh-hd" aria-hidden={i !== index}>
              <p className="dsh-eye">{d.eyebrow ?? ""}</p>
              <h2 style={{ margin: 0, font: "inherit" }}>
                <span className="dsh-t1" style={{ fontSize: fitSize(d.title.length, 56, 330, 0.56) + "px" }}>{d.title}</span>
                <span className="dsh-t2" style={{ fontSize: fitSize(d.subtitle.length, 62, 320, 0.64) + "px" }}>{d.subtitle}</span>
              </h2>
            </div>
          ))}
        </div>

        {onOrder ? (
          <div className="dsh-acts" dir={dir}>
            <button type="button" className="dsh-btn" onClick={() => dish && onOrder(dish, index)}>{Icon.order}{labels.order}</button>
          </div>
        ) : null}

        <div className="dsh-card" dir={dir}>
          <div className="dsh-tabs" role="tablist">
            {["overview", "ingredients"].map((t) => (
              <button key={t} type="button" role="tab" className="dsh-btn dsh-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "overview" ? labels.overview : labels.ingredients}
              </button>
            ))}
          </div>
          <div className="dsh-bodies">
            {dishes.map((d, i) => (
              <div key={i} ref={(el) => { bodies.current[i] = el }} className="dsh-body" aria-hidden={i !== index}>
                <div className="dsh-rate">
                  <div className="dsh-badge" style={{ background: d.accent }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /></svg>
                  </div>
                  <span className="dsh-num">{d.badge}{d.badgeUnit ? <small>{d.badgeUnit}</small> : null}</span>
                </div>
                <p className="dsh-chef">{d.heading}</p>
                <p className="dsh-kit">{d.note ?? " "}</p>
                {tab === "overview" || !d.ingredients?.length ? (
                  <p className="dsh-desc">{d.description}</p>
                ) : (
                  <ul className="dsh-ing">{d.ingredients.map((x) => <li key={x}>{x}</li>)}</ul>
                )}
                {d.chips?.length ? <ul className="dsh-react">{d.chips.map((x) => <li key={x}>{x}</li>)}</ul> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="dsh-strip">
          <button type="button" className="dsh-btn dsh-arrow" aria-label={labels.previous} onClick={() => step(-1)}>
            <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M11 0v16L0 8z" /></svg>
          </button>
          <div className="dsh-win">
            <div className="dsh-track" style={{ transform: "translateX(" + -start * ITEM + "px)" }}>
              {dishes.map((d, i) => (
                <div key={i} className="dsh-th">
                  <button type="button" className="dsh-btn" aria-current={i === index ? "true" : undefined} onClick={() => go(i)}>
                    <img src={d.image} alt="" width={56} height={56} draggable={false} />
                    <span>{d.label ?? d.title + " " + d.subtitle}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="dsh-btn dsh-arrow" aria-label={labels.next} onClick={() => step(1)}>
            <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M1 0v16l11-8z" /></svg>
          </button>
        </div>

      </div>
      <p className="dsh-sr" aria-live="polite">{dish ? index + 1 + " / " + n + ": " + dish.title + " " + dish.subtitle : ""}</p>
    </div>
  )
}

export default DishOrbitCarousel
