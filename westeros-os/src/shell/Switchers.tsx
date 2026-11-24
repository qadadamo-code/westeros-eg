import { Check, ChevronsUpDown, MapPin, Store } from "lucide-react";
import { useBranch, useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { Avatar, MenuItem, MenuLabel, Popover } from "@/ui";

export function RestaurantSwitcher({ collapsed }: { collapsed?: boolean }) {
  const s = useSession();
  const { t, loc } = useT();
  const branch = useBranch();
  // كل الفروع (Saqr 2026-11-24): a user of more than one branch starts on all of them; the working branch for the
  // cashier and kitchen stays a real (non-central) branch underneath
  const v = useViewBranch();
  const allOpt = !v.locked && s.branches.length > 1;
  const onAll = allOpt && !v.value;
  const allLabel = v.allowed ? "كل فروعي" : "كل الفروع";
  const pickAll = () => {
    v.set(null);
    if (branch?.isCentral) { const till = s.branches.find((b) => !b.isCentral); if (till) s.switchBranch(till.id); }
  };
  const pick = (id: string) => { v.set(id); if (id !== s.branchId) s.switchBranch(id); };
  if (!s.restaurant) return null;
  const many = s.memberships.length > 1;
  return (
    <Popover
      width="w-72"
      trigger={({ props }) => (
        <button
          type="button"
          {...props}
          title={loc(s.restaurant!.name)}
          className={cn("group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2 text-start shadow-sf-sm transition-colors hover:border-line-strong", collapsed && "justify-center border-transparent bg-transparent p-1 shadow-none")}
        >
          <Avatar name={loc(s.restaurant!.name).replace(/^مطعم\s+/, "")} color={s.restaurant!.brandColor} size={collapsed ? "md" : "md"} className="rounded-xl" />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold leading-tight">{loc(s.restaurant!.name)}</span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  {onAll ? allLabel : branch ? loc(branch.name) : "—"}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-faint group-hover:text-muted" aria-hidden />
            </>
          ) : null}
        </button>
      )}
    >
      {(close) => (
        <div>
          {many ? (
            <>
              <MenuLabel>{t("shell.switchRestaurant")}</MenuLabel>
              {s.memberships.map(({ restaurant }) => (
                <MenuItem
                  key={restaurant.id}
                  icon={<Store />}
                  active={restaurant.id === s.restaurant?.id}
                  end={restaurant.id === s.restaurant?.id ? <Check className="size-4" /> : null}
                  onClick={() => (close(), void s.switchRestaurant(restaurant.id))}
                >
                  {loc(restaurant.name)}
                </MenuItem>
              ))}
            </>
          ) : null}
          <MenuLabel>{t("shell.switchBranch")}</MenuLabel>
          {allOpt ? (
            <MenuItem icon={<Store />} active={onAll} end={onAll ? <Check className="size-4" /> : null} onClick={() => (close(), pickAll())}>
              <span className="block truncate">{allLabel}</span>
            </MenuItem>
          ) : null}
          {s.branches.map((b) => (
            <MenuItem key={b.id} icon={<MapPin />} active={!onAll && b.id === s.branchId} end={!onAll && b.id === s.branchId ? <Check className="size-4" /> : null} onClick={() => (close(), pick(b.id))}>
              <span className="block truncate">{loc(b.name)}</span>
              <span className="block truncate text-[12px] font-normal text-muted">{loc(b.address)}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
