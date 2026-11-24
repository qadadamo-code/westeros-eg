import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import { useSession } from "@/auth/session";
import { ROLE_LABEL } from "@/auth/roles";
import { useRepo } from "@/data/hooks";
import { staffId } from "@/data/seedIds";
import { WESTEROS_STAFF as DEMO_STAFF } from "@/data/westeros/staff";
import { useT } from "@/i18n/i18n";
import { Avatar, Badge, Button, HotkeyScope, PinPad } from "@/ui";
import { Mark } from "./Logo";

const MAX_TRIES = 5;
const COOLDOWN_S = 30;

/**
 * The idle PIN lock. It only COVERS the app: the page under it stays mounted, so after the PIN the person is exactly
 * where they were, with everything they had typed. "Another user" signs the person out to the names screen instead.
 */
export function LockOverlay() {
  const s = useSession();
  const repo = useRepo();
  const { t, L, loc } = useT();
  const [tries, setTries] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const on = s.resting && !!s.staff;

  // nothing under the cover can be clicked, focused or read by a screen reader
  useEffect(() => {
    if (!on) return;
    const hidden = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute("data-lock-cover") && !el.inert);
    hidden.forEach((el) => (el.inert = true));
    (document.activeElement as HTMLElement | null)?.blur?.();
    return () => hidden.forEach((el) => (el.inert = false));
  }, [on]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!on || !s.staff) return null;
  const staff = s.staff;
  const demoPin = repo.kind === "local" ? DEMO_STAFF.find((d) => staffId(d.key) === staff.id)?.pin : undefined;
  const first = staff.name.split(" ")[0] === "الشيف" ? staff.name : staff.name.split(" ")[0];

  const tryPin = async (pin: string) => {
    if (cooldown) return false;
    if (await s.wake(pin)) {
      setTries(0);
      return true;
    }
    const n = tries + 1;
    setTries(n >= MAX_TRIES ? 0 : n);
    if (n >= MAX_TRIES) setCooldown(COOLDOWN_S);
    return false;
  };

  return createPortal(
    <div data-lock-cover role="dialog" aria-modal="true" aria-label={t("toast.locked")} className="fixed inset-0 z-[2147483000] flex flex-col items-center overflow-y-auto bg-bg px-4 py-8">
      <HotkeyScope>
        <div className="my-auto flex w-full max-w-sm flex-col items-center">
          <Mark className="mb-6 size-10" />
          <Avatar name={staff.name} color={staff.color} size="xl" className="mb-3 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]" />
          <h1 className="text-center text-[26px]">{t("pin.hello", { name: first })}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {loc(ROLE_LABEL[staff.role])} · {t("pin.enter")}
          </p>
          <p className="mt-1 mb-6 text-center text-[13px] text-muted">{L("الشاشة مقفولة. شغلك محفوظ زي ما هو وهترجع لنفس المكان.", "Screen locked. Your work is kept and you return to the same place.")}</p>
          <PinPad onComplete={tryPin} disabled={cooldown > 0} error={cooldown ? t("pin.cooldown", { s: cooldown }) : null} />
          {demoPin ? (
            <Badge tone="brass" className="mt-6">
              {t("pin.demoHint", { pin: demoPin })}
            </Badge>
          ) : null}
          <Button variant="ghost" size="sm" icon={<Users className="size-4" />} onClick={s.lock} className="mt-6">
            {L("مستخدم آخر", "Another user")}
          </Button>
        </div>
      </HotkeyScope>
    </div>,
    document.body,
  );
}
