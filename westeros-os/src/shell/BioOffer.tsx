import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Fingerprint } from "lucide-react";
import { useSession } from "@/auth/session";
import { bioLater, bioOffer, enrollBio, takePin } from "@/auth/biometric";
import { Button, useReduced, useToast } from "@/ui";

/** after a PIN sign-in (and the welcome), offers to sign in next time with this device's face or fingerprint */
export function BioOffer() {
  const s = useSession();
  const { toast } = useToast();
  const reduced = useReduced();
  const [offer, setOffer] = useState<{ rid: string; mid: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOffer(null);
    if (s.status !== "ready" || s.method !== "pin" || !s.staff) return;
    let live = true;
    // waits for the welcome to finish
    const t = setTimeout(() => void bioOffer().then((o) => live && setOffer(o && o.mid === s.staff?.id ? o : null)), 2700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [s.status, s.method, s.staff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const pin = takePin(offer.mid);
      if (!pin) throw new Error("no pin");
      await enrollBio(offer.rid, offer.mid, offer.name, pin);
      toast({ tone: "success", title: "تم تفعيل الدخول بالبصمة", description: "المرة الجاية دوس على زرار البصمة في شاشة الدخول" });
      setOffer(null);
    } catch {
      toast({ tone: "error", title: "البصمة ما اتفعلتش", description: "تقدر تجرب تاني بعد ما تدخل بالـPIN المرة الجاية" });
      setOffer(null);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {offer ? (
        <motion.div
          key="bio"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 24 }}
          className="fixed inset-x-0 bottom-0 z-[85] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div role="dialog" aria-label="الدخول بالبصمة" className="flex w-full max-w-md flex-col gap-3 rounded-[24px] border border-line bg-surface p-5 shadow-sf">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Fingerprint className="size-6" aria-hidden /></span>
              <div className="min-w-0">
                <p className="font-semibold">تدخل المرة الجاية بالبصمة أو الوجه؟</p>
                <p className="text-[13px] text-muted">بتستعمل بصمة الجهاز ده. فعّلها على جهازك الشخصي بس.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { bioLater(offer.rid, offer.mid); setOffer(null); }}>مش دلوقتي</Button>
              <Button loading={busy} icon={<Fingerprint />} onClick={turnOn}>فعّل</Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
