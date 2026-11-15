import { cn } from "@/lib/cn";

/** The Westeros mark: the gold W of the wordmark on its navy. (Swap for the artwork file when it is supplied.) */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#131F34" />
      <path d="M12 19h8.2l4.6 17.5L29.2 19h5.6l4.4 17.5L43.8 19H52l-8.6 27h-7.2L32 31.2 27.8 46h-7.2z" fill="#FBBD13" />
    </svg>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark />
      {!compact ? (
        <span className="leading-none" dir="ltr">
          <span className="block font-sans text-[17px] font-extrabold tracking-[0.14em]">WESTEROS</span>
          <span className="mt-0.5 block text-[10.5px] font-bold tracking-[0.22em] text-brass-text">OS · BURGER &amp; MORE</span>
        </span>
      ) : null}
    </span>
  );
}
