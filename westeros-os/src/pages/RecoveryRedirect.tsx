import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRepo } from "@/data/hooks";

/** A reset link that lands on another page (the auth server falls back to the site address) still ends on /login/reset. */
export function RecoveryRedirect() {
  const repo = useRepo();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!repo.auth.onRecovery) return;
    return repo.auth.onRecovery(() => pathname !== "/login/reset" && nav("/login/reset", { replace: true }));
  }, [repo, nav, pathname]);
  return null;
}
