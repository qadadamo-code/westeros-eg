import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock as LockIcon } from "lucide-react";
import { useSession } from "@/auth/session";
import { useRepo } from "@/data/hooks";
import { Button, IconButton, Input } from "@/ui";
import { Logo } from "@/shell/Logo";
import { AuthToggles } from "./AuthChrome";

/** Opened from the "نسيت كلمة السر" email: the link signs the account in for recovery, then a new password is set here. */
export function ResetPasswordPage() {
  const s = useSession();
  const repo = useRepo();
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the link's token is read by the auth client when the page opens; give it a moment
  useEffect(() => {
    let alive = true;
    const read = () => repo.auth.current().then((u) => alive && (setEmail(u?.email ?? null), setReady(true)), () => alive && setReady(true));
    const t = setTimeout(read, 600);
    const off = repo.auth.onChange((u) => u && alive && (setEmail(u.email ?? null), setReady(true)));
    return () => {
      alive = false;
      clearTimeout(t);
      off();
    };
  }, [repo]);

  const problem = pw.length && pw.length < 8 ? "كلمة السر لازم 8 حروف أو أرقام على الأقل" : pw2 && pw !== pw2 ? "الكلمتين مش زي بعض" : null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || problem || pw.length < 8 || pw !== pw2 || !repo.auth.updatePassword) return;
    setBusy(true);
    setError(null);
    try {
      await repo.auth.updatePassword(pw);
      await s.signIn(email, pw);
      nav("/", { replace: true });
    } catch {
      setError("معرفناش نحفظ كلمة السر. افتح الرابط من الإيميل تاني وجرّب.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex items-center justify-between p-4 sm:p-6">
        <Logo />
        <AuthToggles />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[30px] leading-tight">كلمة سر جديدة</h1>
          {!ready ? (
            <p className="mt-3 text-[15px] text-muted">لحظة...</p>
          ) : !email ? (
            <div className="mt-3 grid gap-3 text-[15px] text-muted">
              <p>الرابط ده خلص أو اتفتح قبل كده. ارجع لصفحة الدخول واضغط "نسيت كلمة السر؟" تاني.</p>
              <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">صفحة الدخول</Link>
            </div>
          ) : (
            <form onSubmit={save} className="mt-6 grid gap-4" noValidate>
              <p className="text-[14px] text-muted" dir="ltr">{email}</p>
              <Input label="كلمة السر الجديدة" type={show ? "text" : "password"} autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} icon={<LockIcon />} size="lg"
                end={<IconButton label={show ? "إخفاء" : "إظهار"} size="sm" onClick={() => setShow((v) => !v)}>{show ? <EyeOff /> : <Eye />}</IconButton>} />
              <Input label="اكتبها تاني" type={show ? "text" : "password"} autoComplete="new-password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} icon={<LockIcon />} size="lg" error={problem ?? error} />
              <Button type="submit" size="lg" block loading={busy} disabled={!!problem || pw.length < 8 || pw !== pw2}>احفظ وادخل</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
