import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, subtitle, icon, actions, className, kicker }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string; kicker?: ReactNode }) {
  return (
    <header className={cn("flex flex-wrap items-end gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-[min(100%,18rem)] flex-1 items-center gap-3.5">
        {icon ? <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-brass/40 bg-[linear-gradient(140deg,color-mix(in_srgb,var(--sf-brass)_30%,var(--sf-surface)),var(--sf-surface))] text-brass-text shadow-sf [&_svg]:size-6">{icon}</span> : null}
        <div className="min-w-0">
          {kicker ? <div className="mb-0.5 text-[12.5px] font-semibold text-brass">{kicker}</div> : null}
          <h1 className="truncate text-[26px] leading-tight font-bold sm:text-[32px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[14px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
