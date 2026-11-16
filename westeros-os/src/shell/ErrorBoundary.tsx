import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { translate, type Lang } from "@/i18n/i18n";
import { Button, EmptyState } from "@/ui";

/** A page chunk from before the last release no longer exists on the server: the tab needs the new build. */
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload|is not a valid JavaScript MIME type/i;
const RELOAD_KEY = "westeros.reloaded-at";
/** Reloads once for a stale build (at most once a minute, so a real outage cannot loop). */
export function reloadIfStale(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!STALE.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export class ErrorBoundary extends Component<{ children: ReactNode; lang: Lang; resetKey?: string }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error(error);
    if (reloadIfStale(error)) return;
    // picked up by the support diagnostics (src/modules/ops/support/diagnostics.ts)
    window.dispatchEvent(new CustomEvent("sufra:error", { detail: error }));
  }
  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  override render() {
    if (!this.state.error) return this.props.children;
    const l = this.props.lang;
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title={translate(l, "error.title")}
        body={translate(l, "error.body")}
        action={<Button onClick={() => (STALE.test(this.state.error?.message ?? "") ? window.location.reload() : this.setState({ error: null }))}>{translate(l, "common.retry")}</Button>}
      />
    );
  }
}
