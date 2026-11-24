import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useSession } from "@/auth/session";
import { ROLE_LABEL } from "@/auth/roles";
import { useLive } from "@/data/hooks";
import { useT } from "@/i18n/i18n";
import { PersonPhoto } from "@/modules/hr/ui";
import { useReduced } from "@/ui";
import { WELCOME_FLAG } from "@/auth/welcome";

/** "أهلاً وسهلاً" with the person's photo and job title, for a moment right after signing in (Mohammed 2026-11-24). */
export function Welcome() {
  const s = useSession();
  const { loc } = useT();
  const reduced = useReduced();
  const profiles = useLive("staffProfiles").data;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (s.status !== "ready" || !s.staff) return;
    let flag = false;
    try {
      flag = sessionStorage.getItem(WELCOME_FLAG) === "1";
      sessionStorage.removeItem(WELCOME_FLAG);
    } catch {
      /* ignore */
    }
    if (!flag) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(t);
  }, [s.status, s.staff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = s.staff;
  const p = m ? profiles?.find((x) => x.membershipId === m.id) : undefined;
  const title = p?.position.ar?.trim() || (m ? loc(ROLE_LABEL[m.role]) : "");

  return createPortal(
    <AnimatePresence>
      {show && m ? (
        <motion.div
          key="welcome"
          role="status"
          onClick={() => setShow(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.25 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-bg/85 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={reduced ? false : { y: 18, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[28px] border border-line bg-surface px-6 py-8 text-center shadow-sf"
          >
            <PersonPhoto m={m} p={p} size="xl" />
            <div>
              <p className="text-[15px] text-muted">أهلاً وسهلاً</p>
              <p className="mt-1 font-display text-[26px] font-semibold leading-tight">{m.name}</p>
              {title ? <p className="mt-2 inline-block rounded-full bg-surface-3 px-3 py-1 text-[13px] font-semibold text-ink-2">{title}</p> : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
