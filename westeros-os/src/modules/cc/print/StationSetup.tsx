/**
 * تشغيل محطة الطباعة على ويندوز أو أندرويد (Saqr 2026-11-25). Android runs the same small helper inside the free
 * Termux app (public/westeros-station.sh). iPhone cannot be a station; it prints through one.
 */
import { useState } from "react";
import { Copy, Download, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { useToast } from "@/ui";
import { STATION_FILE } from "./station";

export const ANDROID_FILE = "westeros-station.sh";
const TERMUX = "https://f-droid.org/packages/com.termux/";
const TERMUX_BOOT = "https://f-droid.org/packages/com.termux.boot/";

export function StationSetup({ showOpen = true }: { showOpen?: boolean }) {
  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
  const { toast } = useToast();
  const [os, setOs] = useState<"windows" | "android">(isAndroid ? "android" : "windows");
  const base = import.meta.env.BASE_URL;
  const cmd = `curl -fsSL ${typeof location !== "undefined" ? location.origin : ""}${base}${ANDROID_FILE} | sh`;
  const copy = () => void navigator.clipboard?.writeText(cmd).then(() => toast({ title: "اتنسخ الأمر", tone: "success", duration: 1500 }), () => toast({ title: "انسخه يدوي", tone: "error" }));
  const tab = (k: "windows" | "android", label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setOs(k)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold ${os === k ? "bg-ink text-bg" : "hover:bg-surface"}`}>{icon}{label}</button>
  );
  const open = showOpen ? <a href={`${base}print-station`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 font-semibold hover:bg-surface"><ExternalLink className="size-4" />فتح شاشة المحطة</a> : null;
  return (
    <div className="grid gap-2 text-[13.5px]" data-station-setup>
      <div className="flex w-fit gap-1 rounded-xl border border-line p-1">
        {tab("windows", "كمبيوتر ويندوز", <Monitor className="size-4" />)}
        {tab("android", "تابلت أو موبايل أندرويد", <Smartphone className="size-4" />)}
      </div>
      {os === "windows" ? (
        <>
          <ol className="list-decimal space-y-1 ps-5">
            <li>نزّل برنامج المحطة وافتحه مرة واحدة (بيشتغل لوحده بعد كده كل ما الكمبيوتر يفتح).</li>
            <li>افتح شاشة المحطة في كروم على نفس الكمبيوتر وسيبها مفتوحة.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a href={`${base}${STATION_FILE}`} download className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 font-semibold text-bg"><Download className="size-4" />تنزيل برنامج المحطة</a>
            {open}
          </div>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 ps-5">
            <li>نزّل تطبيق <a href={TERMUX} target="_blank" rel="noreferrer" className="font-semibold underline">Termux</a> (مجاني).</li>
            <li>افتحه، والصق الأمر ده واضغط Enter، واستنى لحد ما يكتب Done:</li>
          </ol>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <code dir="ltr" className="flex-1 break-all text-[12px]">{cmd}</code>
            <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-bg"><Copy className="size-3.5" />نسخ</button>
          </div>
          <ol start={3} className="list-decimal space-y-1 ps-5">
            <li>افتح شاشة المحطة في كروم على نفس الجهاز وسيبها مفتوحة، والجهاز على الشاحن.</li>
          </ol>
          <div className="flex flex-wrap gap-2">{open}</div>
          <p className="text-[12.5px] text-muted">عشان المحطة تشتغل لوحدها لما الجهاز يقفل ويفتح، نزّل كمان <a href={TERMUX_BOOT} target="_blank" rel="noreferrer" className="underline">Termux:Boot</a> وافتحه مرة واحدة. ولو مش منزّله، افتح Termux مرة بعد كل تشغيل للجهاز.</p>
        </>
      )}
      <p className="text-[12.5px] text-muted">المحطة والطابعات لازم يكونوا على نفس شبكة المطعم. باقي الأجهزة (أندرويد، آيفون، ويندوز) تطبع من خلال المحطة من أي مكان عن طريق الإنترنت. الآيفون مينفعش يبقى محطة.</p>
    </div>
  );
}
