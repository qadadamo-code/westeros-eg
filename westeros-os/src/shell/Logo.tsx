import { cn } from "@/lib/cn";
import { LOGO_GOLD, LOGO_PATHS, LOGO_VIEWBOX } from "./logoPaths";

/** The Westeros mark: the gold burger-and-wordmark artwork on its black tile. */
export function Mark({ className }: { className?: string }) {
  const [x, y, w, h] = LOGO_VIEWBOX.split(" ").map(Number);
  return (
    <svg viewBox={LOGO_VIEWBOX} className={cn("size-9 shrink-0", className)} aria-hidden>
      <rect x={x} y={y} width={w} height={h} rx={w * 0.22} fill="#000" />
      <g fill={LOGO_GOLD}>
        {LOGO_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className="size-11" />
      {!compact ? (
        <span className="leading-none" dir="ltr">
          <span className="block font-sans text-[17px] font-extrabold tracking-[0.14em]">WESTEROS</span>
          <span className="mt-0.5 block text-[10.5px] font-bold tracking-[0.22em] text-brass-text">OS · BURGER &amp; MORE</span>
        </span>
      ) : null}
    </span>
  );
}
