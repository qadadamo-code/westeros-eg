import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Fingerprint, Mail, WifiOff } from "lucide-react";
import { bioRecords, bioSupported, bioUnlock, dropBio } from "@/auth/biometric";
import { useSession } from "@/auth/session";
import { useRepo } from "@/data/hooks";
import type { Restaurant } from "@/data/types";
import { WESTEROS_STAFF as DEMO_STAFF } from "@/data/westeros/staff";
import { useT } from "@/i18n/i18n";
import { homeFor } from "@/modules/registry";
import { Badge, Button, EmptyState, PinPad, spring, useReduced, useToast } from "@/ui";
import { Mark } from "@/shell/Logo";
import { AuthToggles, StarPattern } from "./AuthChrome";

const MAX_TRIES = 5;
const COOLDOWN_S = 30;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function PinLoginPage() {
  const s = useSession();
  const repo = useRepo();
  const { t, loc, lang } = useT();
  const nav = useNavigate();
  const location = useLocation();
  const reduced = useReduced();
  const now = useClock();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [tries, setTries] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();
  const [bio, setBio] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    const rid = s.deviceRestaurantId;
    if (!rid || !bioRecords(rid).length) return setBio(false);
    void bioSupported().then(setBio);
  }, [s.deviceRestaurantId]);

  // face / fingerprint: the device unlocks the saved PIN, then the normal PIN sign-in runs
  const tryBio = async () => {
    const rid = s.deviceRestaurantId;
    if (!rid || bioBusy || cooldown) return;
    setBioBusy(true);
    try {
      const got = await bioUnlock(rid);
      if (!got) return;
      if (await s.pinSignIn(got.memberId, got.pin)) return;
      dropBio(rid, got.memberId);
      setBio(bioRecords(rid).length > 0);
      toast({ tone: "error", title: t("pin.bioStale") });
    } catch {
      toast({ tone: "error", title: t("pin.bioStale") });
    } finally {
      setBioBusy(false);
    }
  };

  useEffect(() => {
    if (s.status !== "ready" || !s.staff) return;
    // a link opened before signing in (a scanned batch sticker) continues to its page
    const from = (location.state as { from?: string } | null)?.from;
    nav(from && from !== "/" ? from : homeFor(s.role), { replace: true });
  }, [s.status, s.staff, s.role, nav, location.state]);

  useEffect(() => {
    const rid = s.deviceRestaurantId;
    if (!rid) return;
    repo.list("restaurants", { where: { id: rid } }).then((r) => setRestaurant(r[0] ?? null), () => {});
  }, [repo, s.deviceRestaurantId, s.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // PIN only (Mohammed 2026-11-24): no names to pick; the PIN says who the person is, then the welcome greets them
  const tryPin = async (pin: string) => {
    if (cooldown) return false;
    try {
      if (await s.pinSignIn(null, pin)) return true;
    } catch (e) {
      if ((e as { code?: string }).code === "pin_locked") {
        setTries(0);
        setCooldown(COOLDOWN_S);
        return false;
      }
      throw e;
    }
    const n = tries + 1;
    setTries(n);
    if (n >= MAX_TRIES) {
      setTries(0);
      setCooldown(COOLDOWN_S);
    }
    return false;
  };

  const time = now.toLocaleTimeString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0 overflow-hidden text-primary" aria-hidden>
        <StarPattern className="absolute" opacity={0.09} />
      </div>
      <div className="pointer-events-none absolute -top-56 start-1/2 size-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--sf-primary)_14%,transparent),transparent_62%)] rtl:translate-x-1/2" aria-hidden />

      <header className="relative flex items-center gap-3 p-4 sm:p-6">
        <Mark className="size-10" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[18px] font-semibold">{restaurant ? loc(restaurant.name) : t("app.name")}</p>
          <p className="truncate text-[12.5px] text-muted">{date}</p>
        </div>
        <p className="num ms-auto hidden text-[26px] font-medium text-ink-2 sm:block" dir="ltr">
          {time}
        </p>
        <AuthToggles />
      </header>

      <main className="relative flex flex-1 flex-col items-center px-4 pb-10 sm:px-6">
        {!s.deviceRestaurantId ? (
          <EmptyState
            className="mt-16"
            icon={<Mail />}
            title={t("pin.needsDevice")}
            action={
              <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                {t("pin.emailInstead")}
              </Link>
            }
          />
        ) : (
          <motion.section
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : spring.soft}
            className="flex w-full max-w-sm flex-col items-center"
          >
            <h1 className="mt-4 text-center text-[34px] leading-tight sm:text-[40px]">{t("pin.title")}</h1>
            <p className="mt-2 mb-8 text-center text-[15.5px] text-muted">{t("pin.subtitle")}</p>
            {!s.user && repo.kind !== "local" ? (
              s.offline ? (
                <EmptyState icon={<WifiOff />} title={t("pin.offline")} body={t("pin.offlineHint")} />
              ) : (
                <EmptyState
                  icon={<Mail />}
                  title={t("pin.deviceOut")}
                  body={t("pin.deviceOutHint")}
                  action={
                    <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                      {t("pin.emailInstead")}
                    </Link>
                  }
                />
              )
            ) : (
              <>
                {bio ? (
                  <Button size="lg" variant="secondary" className="mb-6" icon={<Fingerprint />} loading={bioBusy} disabled={cooldown > 0} onClick={tryBio}>
                    {t("pin.bio")}
                  </Button>
                ) : null}
                <PinPad onComplete={tryPin} disabled={cooldown > 0} error={cooldown ? t("pin.cooldown", { s: cooldown }) : null} />
              </>
            )}
            {repo.kind === "local" ? (
              <Badge tone="brass" className="mt-6">
                {t("pin.demoHint", { pin: DEMO_STAFF[0].pin })}
              </Badge>
            ) : null}
            <div className={!s.user && repo.kind !== "local" && !s.offline ? "hidden" : "mt-8 text-center"}>
              <Link to="/login" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink">
                <Mail className="size-4" aria-hidden />
                {t("pin.emailInstead")}
              </Link>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
