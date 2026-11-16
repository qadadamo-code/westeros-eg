// Adapted for Westeros from the 21st.dev component "Scroll stacking cards / Project Deck" (Aakash Mehra):
// a scroll-dealt deck. Each card rises from below leaning toward you and out of focus, flattens as it lands,
// and the cards beneath lean back, sink and dim. The corner is cut away to hold the card's name and price.
import { useRef, type ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/cn";

export type DeckCard = {
  key: string;
  title: string;
  /** small line under the title (the price) */
  subtitle?: string;
  /** line over the photo, top corner */
  tag?: string;
  image: string;
  description?: string;
};

export type StackingCardsProps = {
  cards: DeckCard[];
  /** The page ground; the cut-out corner is filled with it. */
  ground?: string;
  /** colour of the round mark in the corner */
  accent?: string;
  mark?: ReactNode;
  label: string;
  className?: string;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const ENTER = 0.72; // share of each card's screen spent arriving; the rest it rests in place

/** How far card `j` has arrived (0 below the window, 1 landed) at deck progress `v`. */
export function arrived(j: number, v: number, count: number) {
  if (j <= 0) return 1;
  const span = Math.max(1, count - 1);
  return easeOut(clamp01((v * span - (j - 1)) / ENTER));
}

export function StackingCards({ cards, ground = "var(--color-background)", accent = "var(--color-primary)", mark, label, className }: StackingCardsProps) {
  const deck = useRef(null as HTMLElement | null);
  const reduce = useReducedMotion() ?? false;
  const count = cards.length;
  const { scrollYProgress } = useScroll({ target: deck, offset: ["start start", "end end"] });
  // a light, critically damped smoothing: it follows the wheel closely and never overshoots
  const progress = useSpring(scrollYProgress, { stiffness: 380, damping: 48, mass: 0.35 });
  return (
    <MotionConfig reducedMotion="user">
      {/* one screen of scroll per card; the stage stays pinned while they are dealt onto it */}
      <section ref={deck} className={cn("relative w-full", className)} style={{ height: `${Math.max(1, count) * 100}svh` }} aria-label={label}>
        <div className="sticky top-0 grid h-[100svh] place-items-center overflow-hidden px-5 [perspective:1800px] sm:px-10 lg:px-14">
          {cards.map((c, i) => (
            <Card key={c.key} c={c} i={i} count={count} progress={progress} still={reduce} ground={ground} accent={accent} mark={mark} />
          ))}
        </div>
      </section>
    </MotionConfig>
  );
}

function Card({ c, i, count, progress, still, ground, accent, mark }: { c: DeckCard; i: number; count: number; progress: MotionValue<number>; still: boolean; ground: string; accent: string; mark?: ReactNode }) {
  // cards now lying on top of this one, counted smoothly
  const above = (v: number) => {
    let n = 0;
    for (let j = i + 1; j < count; j++) n += arrived(j, v, count);
    return Math.min(3, n);
  };
  const y = useTransform(progress, (v) => `${(1 - arrived(i, v, count)) * 108 - above(v) * 5}svh`); // covered cards lift so their edges show
  const rotateX = useTransform(progress, (v) => -(1 - arrived(i, v, count)) * 30 + above(v) * 5);
  const scale = useTransform(progress, (v) => 0.9 + 0.1 * arrived(i, v, count) - above(v) * 0.05);
  const filter = useTransform(progress, (v) => `blur(${((1 - arrived(i, v, count)) ** 2 * 12 + above(v) * 1.1).toFixed(2)}px)`);
  const dim = useTransform(progress, (v) => above(v) * 0.15);
  // reduced motion: no travel, each card simply appears in place when its turn comes
  const stillY = useTransform(progress, (v) => (arrived(i, v, count) >= 0.5 ? "0svh" : "110svh"));
  const R = 18;
  const corner = (
    <svg aria-hidden width={R} height={R} viewBox={`0 0 ${R} ${R}`} className="block">
      <path d={`M${R} 0 V${R} H0 A${R} ${R} 0 0 0 ${R} 0 Z`} fill={ground} />
    </svg>
  );
  return (
    <motion.article
      aria-label={`${c.title}${c.subtitle ? `: ${c.subtitle}` : ""}`}
      className="col-start-1 row-start-1 mt-[6svh] w-[min(100%,calc(78svh*16/9),1280px)] origin-[50%_25%] will-change-[transform,filter] max-sm:w-full"
      style={{ zIndex: i + 1, ...(still ? { y: stillY } : { y, rotateX, scale, filter }) }}
    >
      <div className="relative overflow-hidden rounded-[24px] shadow-[0_50px_90px_-35px_rgba(0,0,0,0.7)]" style={{ background: ground }}>
        <img src={c.image} alt="" loading={i < 2 ? "eager" : "lazy"} decoding="async" className="block aspect-[16/9] w-full bg-surface-2 object-cover max-sm:aspect-[4/5]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.55)_0%,transparent_34%)]" />
        {c.tag || c.description ? (
          <div className="absolute inset-x-0 top-0 p-5 text-white sm:p-8">
            {c.tag ? <p className="text-[12.5px] font-bold tracking-wide text-[#f8bb18] sm:text-[14px]">{c.tag}</p> : null}
            {c.description ? <p className="mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-white/90 sm:text-[16px]">{c.description}</p> : null}
          </div>
        ) : null}
        {/* the name and price, set into a corner cut out of the card (physical corner: the art is not mirrored) */}
        <div className="absolute right-0 bottom-0 z-10">
          <div className="absolute right-0 bottom-full">{corner}</div>
          <div className="absolute right-full bottom-0">{corner}</div>
          <div className="flex items-center gap-4 rounded-tl-[20px] py-3 pr-2 pl-5 text-ink sm:gap-5 sm:py-4 sm:pl-7" style={{ background: ground }}>
            <span className="flex flex-col leading-tight">
              <span className="text-[16px] font-bold sm:text-[20px]">{c.title}</span>
              {c.subtitle ? <span className="num text-[13px] font-semibold text-brass-text sm:text-[15px]">{c.subtitle}</span> : null}
            </span>
            <span className="grid size-11 place-items-center rounded-full text-[#0d0d0d] sm:size-[52px] [&_svg]:size-5 sm:[&_svg]:size-6" style={{ background: accent }}>
              {mark}
            </span>
          </div>
        </div>
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: still ? 0 : dim }} />
      </div>
    </motion.article>
  );
}
