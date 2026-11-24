/**
 * From the user menu, for every user (Saqr 2026-11-24): change your own PIN (type the current one first), and pick
 * after how long this device locks its screen when nobody touches it.
 */
import { useState } from "react";
import { dropBio } from "@/auth/biometric";
import { useSession } from "@/auth/session";
import { useRepo, useLive } from "@/data/hooks";
import { loadRaw, saveRaw } from "@/lib/storage";
import { Button, Dialog, Input, PIN_RULE, Select, useToast } from "@/ui";

const LOCK_KEY = "westeros-os.autoLockMinutes";

/** minutes this device waits before locking: its own choice, else the restaurant's; 0 = never */
export function deviceLockMinutes(restaurantDefault: number): number {
  const v = loadRaw(LOCK_KEY);
  return v === null || v === "" ? restaurantDefault : Math.max(0, Number(v) || 0);
}

export function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const repo = useRepo();
  const { toast } = useToast();
  const [oldPin, setOld] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rid = s.restaurant?.id;
  const ok = /^\d{4,6}$/.test(oldPin) && PIN_RULE.test(pin) && pin === again;
  const save = async () => {
    if (!rid || !s.staff || !repo.auth.changeMyPin) return;
    setBusy(true);
    setError(null);
    try {
      await repo.auth.changeMyPin(rid, s.staff.id, oldPin, pin);
      dropBio(rid, s.staff.id); // the saved face/fingerprint held the old PIN: turn it on again with the new one
      toast({ tone: "success", title: "تم تغيير الـPIN", description: "من دلوقتي ادخل بالـPIN الجديد." });
      onClose();
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      setError(/old_pin_wrong/.test(msg) ? "الـPIN الحالي غلط" : /pin_taken/.test(msg) ? "الـPIN ده مستخدم مع موظف تاني، اختار غيره" : "معرفناش نغيّره دلوقتي، جرّب تاني");
    } finally {
      setBusy(false);
    }
  };
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <Dialog open onClose={onClose} title="تغيير الـPIN" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!ok} onClick={save}>حفظ</Button></>}>
      <div className="grid gap-3">
        <Input label="الـPIN الحالي" type="password" inputMode="numeric" dir="ltr" autoComplete="current-password" value={oldPin} onChange={(e) => setOld(digits(e.target.value))} error={error} />
        <Input label="الـPIN الجديد (6 أرقام)" type="password" inputMode="numeric" dir="ltr" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} hint="ممنوع يتكرر مع موظف تاني" />
        <Input label="اكتب الـPIN الجديد تاني" type="password" inputMode="numeric" dir="ltr" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} error={again && again !== pin ? "مش زي الـPIN الجديد" : undefined} />
      </div>
    </Dialog>
  );
}

export function LockTimeDialog({ onClose }: { onClose: () => void }) {
  const settings = useLive("settings").data[0];
  const def = settings?.autoLockMinutes ?? 0;
  const { toast } = useToast();
  const [v, setV] = useState(() => loadRaw(LOCK_KEY) ?? "");
  const label = (m: number) => (m === 0 ? "أبداً" : m === 1 ? "دقيقة" : m === 2 ? "دقيقتين" : m <= 10 ? `${m} دقايق` : `${m} دقيقة`);
  const save = () => {
    saveRaw(LOCK_KEY, v);
    toast({ tone: "success", title: "تم حفظ وقت قفل الشاشة" });
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="وقت قفل الشاشة" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></>}>
      <div className="grid gap-3">
        <p className="text-[14px] text-muted">الشاشة بتتقفل لوحدها لو محدش لمس الجهاز المدة دي، وترجع بالـPIN. الاختيار ده للجهاز ده بس.</p>
        <Select
          label="اقفل الشاشة بعد"
          value={v}
          onChange={(e) => setV(e.target.value)}
          options={[{ value: "", label: `زي إعداد المطعم (${label(def)})` }, ...[1, 2, 3, 5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: label(m) })), { value: "0", label: "أبداً" }]}
        />
      </div>
    </Dialog>
  );
}
