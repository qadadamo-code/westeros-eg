import { useState } from "react";
import { Feather, KeyRound, Keyboard, Languages, Lock, LogOut, Monitor, Moon, RotateCcw, Sparkles, Sun, Timer, Users } from "lucide-react";
import { ChangePinDialog, LockTimeDialog } from "./AccountDialogs";
import { liteChoice, setLiteChoice } from "@/lib/device";
import { useSession } from "@/auth/session";
import { ROLE_LABEL } from "@/auth/roles";
import { useRepo } from "@/data/hooks";
import { useT } from "@/i18n/i18n";
import { useTheme } from "@/theme/theme";
import { cn } from "@/lib/cn";
import { Avatar, Badge, MenuItem, MenuSeparator, Popover, Segmented, useToast } from "@/ui";
import { ShortcutsDialog } from "./ShortcutsDialog";

export function UserMenu({ side = "bottom", align = "end", full }: { side?: "top" | "bottom"; align?: "start" | "end"; full?: boolean }) {
  const s = useSession();
  const repo = useRepo();
  const { t, lang, loc, toggleLang } = useT();
  const theme = useTheme();
  const { toast } = useToast();
  const [shortcuts, setShortcuts] = useState(false);
  const [dialog, setDialog] = useState<"pin" | "lockTime" | null>(null);
  const [lite, setLite] = useState<"auto" | "lite" | "full">(() => { const c = liteChoice(); return c === null ? "auto" : c ? "lite" : "full"; });
  if (!s.staff) return null;
  const staff = s.staff;
  return (
    <>
      <Popover
        side={side}
        align={align}
        width="w-80"
        trigger={({ props }) => (
          <button
            type="button"
            {...props}
            aria-label={staff.name}
            className={cn("flex items-center gap-2.5 rounded-full text-start transition-colors hover:bg-surface-3", full ? "w-full rounded-2xl p-1.5" : "p-0.5")}
          >
            <Avatar name={staff.name} color={staff.color} size={full ? "md" : "sm"} status="online" />
            {full ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-tight">{staff.name}</span>
                <span className="block truncate text-[12px] text-muted">{loc(ROLE_LABEL[staff.role])}</span>
              </span>
            ) : null}
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="flex items-center gap-3 px-3 pt-2 pb-3">
              <Avatar name={staff.name} color={staff.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[15.5px] font-bold">{staff.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="primary" size="sm">
                    {loc(ROLE_LABEL[staff.role])}
                  </Badge>
                  <Badge size="sm">{s.method === "pin" ? t("shell.viaPin") : t("shell.viaEmail")}</Badge>
                </div>
                {s.user?.email && s.method === "password" ? <p className="mt-1 truncate text-[12px] text-muted ltr">{s.user.email}</p> : null}
              </div>
            </div>
            <div className="px-2 pb-2">
              <Segmented
                block
                size="sm"
                label={t("shell.theme")}
                value={theme.pref}
                onChange={theme.set}
                options={[
                  { value: "light", label: t("shell.themeLight"), icon: <Sun /> },
                  { value: "dark", label: t("shell.themeDark"), icon: <Moon /> },
                  { value: "system", label: t("shell.themeSystem"), icon: <Monitor /> },
                ]}
              />
            </div>
            {/* light mode (src/lib/device.ts): the heavy glass effects off on modest devices, chosen per device */}
            <div className="px-2 pb-2">
              <Segmented
                block
                size="sm"
                label={lang === "ar" ? "شكل العرض" : "Display"}
                value={lite}
                onChange={(v: "auto" | "lite" | "full") => { setLite(v); setLiteChoice(v === "auto" ? null : v === "lite"); }}
                options={[
                  { value: "auto", label: lang === "ar" ? "تلقائي" : "Auto", icon: <Monitor /> },
                  { value: "lite", label: lang === "ar" ? "خفيف" : "Light", icon: <Feather /> },
                  { value: "full", label: lang === "ar" ? "كامل" : "Full", icon: <Sparkles /> },
                ]}
              />
            </div>
            <MenuItem icon={<Languages />} onClick={toggleLang} end={<span className="text-[12px] text-muted">{lang === "ar" ? "EN" : "ع"}</span>}>
              {t("shell.langSwitch")}
            </MenuItem>
            <MenuItem icon={<Keyboard />} onClick={() => (close(), setShortcuts(true))} end={<span className="font-mono text-[12px] text-muted">?</span>}>
              {t("shell.shortcuts")}
            </MenuItem>
            <MenuSeparator />
            {s.deviceRestaurantId && s.method === "pin" ? (
              <MenuItem icon={<Lock />} onClick={() => (close(), s.rest())}>
                {t("shell.lock")}
              </MenuItem>
            ) : null}
            {staff.hasPin && repo.auth.changeMyPin ? (
              <MenuItem icon={<KeyRound />} onClick={() => (close(), setDialog("pin"))}>
                {lang === "ar" ? "تغيير الـPIN" : "Change PIN"}
              </MenuItem>
            ) : null}
            {s.deviceRestaurantId ? (
              <MenuItem icon={<Timer />} onClick={() => (close(), setDialog("lockTime"))}>
                {lang === "ar" ? "وقت قفل الشاشة" : "Auto-lock time"}
              </MenuItem>
            ) : null}
            {s.deviceRestaurantId ? (
              <MenuItem icon={<Users />} onClick={() => (close(), s.lock())}>
                {t("shell.switchUser")}
              </MenuItem>
            ) : null}
            {repo.reset ? (
              <MenuItem
                icon={<RotateCcw />}
                onClick={async () => {
                  close();
                  await repo.reset!();
                  toast({ title: t("toast.demoReset"), tone: "success" });
                }}
              >
                {t("shell.resetDemo")}
              </MenuItem>
            ) : null}
            {s.deviceRestaurantId ? (
              // signing out ends this person's session completely; the device stays linked so the names screen works
              <MenuItem icon={<LogOut />} danger onClick={() => (close(), s.lock())}>
                {t("shell.signOut")}
              </MenuItem>
            ) : null}
            {s.user && (s.method === "password" || !s.deviceRestaurantId) ? (
              <MenuItem icon={<LogOut />} danger onClick={() => (close(), void s.signOut())}>
                {t("shell.signOutDevice")}
              </MenuItem>
            ) : null}
          </div>
        )}
      </Popover>
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      {dialog === "pin" ? <ChangePinDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "lockTime" ? <LockTimeDialog onClose={() => setDialog(null)} /> : null}
    </>
  );
}
