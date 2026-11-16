/**
 * History and restore: the journal of every change (0017_history.sql). A manager undoes one wrong change;
 * the owner takes the whole restaurant back to a moment in time. Needs the cloud database.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudOff, History, RotateCcw, ShieldAlert, Undo2 } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { ChangeRow } from "@/data/repo";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { ago, clock, dayLabel, startOfDay } from "@/lib/time";
import { PageHeader } from "@/shell/PageHeader";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Input, Spinner, useToast } from "@/ui";
import { SettingsNav } from "../SettingsNav";
import { changedFields, fieldsText, opLabel, recordName, tableLabel, undoable } from "./describe";

/** value for <input type="datetime-local"> in local time */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function HistoryPage() {
  const { L, lang } = useT();
  const db = useDb();
  const { role } = useSession();
  const { toast } = useToast();
  const api = db.repo.history;
  const rid = db.restaurantId;
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() - 60 * 60_000)));
  const [count, setCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [word, setWord] = useState("");
  const [restoring, setRestoring] = useState(false);
  const manager = role === "owner" || role === "admin" || role === "manager";
  const owner = role === "owner";
  const WORD = L("استرجاع", "RESTORE");

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setRows(await api.list(rid));
      setFailed(false);
    } catch {
      setFailed(true);
      setRows([]);
    }
  }, [api, rid]);
  useEffect(() => {
    void load();
    if (api && manager) void api.prune(rid).catch(() => undefined);
  }, [load, api, rid, manager]);

  const moment = useMemo(() => {
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [when]);
  const tooOld = !!moment && moment.getTime() < Date.now() - 30 * 86_400_000;
  const future = !!moment && moment.getTime() > Date.now();
  useEffect(() => {
    setCount(null);
    if (!api || !moment || future || tooOld) return;
    let live = true;
    const t = setTimeout(() => {
      api.countSince(rid, moment.toISOString()).then((n) => live && setCount(n), () => live && setCount(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [api, rid, moment, future, tooOld]);

  const undo = async (c: ChangeRow) => {
    if (!api) return;
    setBusy(c.id);
    try {
      await api.undo(c.id);
      await db.audit("history.undo", c.table, c.rowId, { change: c.id, op: c.op });
      toast({ title: L("اتراجعنا عن الحركة", "Change undone"), tone: "success" });
      await load();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      toast({
        title: /newer change/.test(msg) ? L("فيه تعديل أحدث على نفس السجل، ارجع عنه الأول", "A newer change exists on this record, undo that first") : L("ماقدرناش نتراجع عن الحركة دي", "This change could not be undone"),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!api || !moment) return;
    setRestoring(true);
    try {
      const n = await api.restoreTo(rid, moment.toISOString());
      await db.audit("history.restore", "restaurants", rid, { to: moment.toISOString(), reverted: n }).catch(() => undefined);
      toast({ title: L(`رجّعنا ${n} حركة`, `${n} changes reversed`), tone: "success" });
      // every screen holds data from before the restore: load the app again
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast({ title: L("الاسترجاع ماكملش، ومفيش حاجة اتغيرت", "The restore did not finish, nothing was changed"), tone: "error" });
      setRestoring(false);
    }
  };

  const quick: [string, Date][] = [
    [L("قبل ربع ساعة", "15 min ago"), new Date(Date.now() - 15 * 60_000)],
    [L("قبل ساعة", "1 hour ago"), new Date(Date.now() - 60 * 60_000)],
    [L("بداية اليوم", "Start of today"), startOfDay()],
    [L("أمس نفس الوقت", "Yesterday, same time"), new Date(Date.now() - 86_400_000)],
  ];

  return (
    <div className="grid gap-6">
      <SettingsNav />
      <PageHeader icon={<History />} title={L("السجل والاسترجاع", "History & restore")} subtitle={L("كل حركة بتتسجل: ارجع عن حركة غلط، أو رجّع المطعم كله لوقت محدد", "Every change is recorded: undo a wrong one, or take the restaurant back to a moment")} />

      {!api ? (
        <Card>
          <EmptyState icon={<CloudOff />} title={L("متاح مع قاعدة البيانات", "Needs the cloud database")} body={L("السجل والاسترجاع بيشتغلوا لما النظام يكون متصل بقاعدة بيانات المطعم.", "History and restore work when the system is connected to the restaurant database.")} />
        </Card>
      ) : !manager ? (
        <Card>
          <EmptyState icon={<ShieldAlert />} title={L("للمدير وصاحب المطعم", "Managers and the owner only")} />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader icon={<RotateCcw />} title={L("استرجاع كامل", "Full restore")} subtitle={L("يرجّع كل بيانات المطعم زي ما كانت في الوقت اللي تختاره (آخر 30 يوم)", "Puts all the restaurant's data back as it was at the moment you pick (last 30 days)")} />
            <div className="grid gap-4 px-5 pb-5">
              <div className="flex flex-wrap items-end gap-3">
                <Input type="datetime-local" label={L("ارجع لوقت", "Go back to")} value={when} max={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} wrapClassName="w-full sm:w-72" dir="ltr" />
                <div className="flex flex-wrap gap-2">
                  {quick.map(([label, d]) => (
                    <button key={label} type="button" onClick={() => setWhen(localInput(d))} className="h-11 rounded-xl border border-line px-3.5 text-[13.5px] font-semibold hover:bg-surface-2">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className={cn("min-w-0 flex-1 text-[14px]", future || tooOld ? "text-danger" : "text-muted")}>
                  {future
                    ? L("الوقت ده لسه ماجاش", "That moment is in the future")
                    : tooOld
                      ? L("السجل بيحتفظ بآخر 30 يوم بس", "The journal keeps the last 30 days only")
                      : count === null
                        ? L("بنحسب الحركات…", "Counting changes…")
                        : count === 0
                          ? L("مفيش حركات بعد الوقت ده", "No changes after that moment")
                          : L(`${count} حركة بعد الوقت ده هتترجع`, `${count} changes after that moment will be reversed`)}
                </p>
                <Button variant="danger" icon={<RotateCcw className="size-4" />} disabled={!owner || !moment || future || tooOld || !count} onClick={() => (setWord(""), setConfirm(true))}>
                  {L("استرجع", "Restore")}
                </Button>
              </div>
              {!owner ? <p className="text-[13px] text-muted">{L("الاسترجاع الكامل لصاحب المطعم بس.", "Only the owner can run a full restore.")}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader icon={<Undo2 />} title={L("آخر الحركات", "Latest changes")} subtitle={L("التراجع بيرجّع السجل زي ما كان قبل الحركة", "Undo puts the record back as it was before the change")} />
            {rows === null ? (
              <div className="grid place-items-center py-14">
                <Spinner />
              </div>
            ) : failed ? (
              <EmptyState icon={<ShieldAlert />} title={L("ماقدرناش نقرا السجل", "Could not read the journal")} action={<Button onClick={() => void load()}>{L("جرّب تاني", "Try again")}</Button>} />
            ) : rows.length === 0 ? (
              <EmptyState icon={<History />} title={L("مفيش حركات لسه", "No changes yet")} body={L("أول ما حد يضيف أو يعدّل أو يحذف حاجة هتظهر هنا.", "As soon as someone adds, edits or deletes something it shows here.")} />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((c) => {
                  const name = recordName(c, lang);
                  const fields = fieldsText(changedFields(c), lang);
                  const can = undoable(c, rows);
                  return (
                    <li key={c.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3", c.undoneAt && "opacity-55")}>
                      <Badge size="sm" tone={c.op === "D" ? "danger" : c.op === "I" ? "ok" : "info"}>
                        {opLabel(c.op, lang)}
                      </Badge>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate font-semibold">
                          {tableLabel(c.table, lang)}
                          {name ? <span className="text-ink-2"> · {name}</span> : null}
                        </p>
                        <p className="truncate text-[12.5px] text-muted">
                          {dayLabel(c.createdAt, lang)} {clock(c.createdAt, lang)} · {ago(c.createdAt, lang)}
                          {fields ? ` · ${fields}` : ""}
                        </p>
                      </div>
                      {c.source !== "app" ? <Badge size="sm">{c.source === "undo" ? L("تراجع", "Undo") : L("استرجاع", "Restore")}</Badge> : null}
                      {c.undoneAt ? (
                        <Badge size="sm" tone="warn">
                          {L("اترجع عنها", "Undone")}
                        </Badge>
                      ) : can ? (
                        <Button size="sm" variant="soft" icon={<Undo2 className="size-4" />} loading={busy === c.id} disabled={busy !== null} onClick={() => void undo(c)}>
                          {L("تراجع", "Undo")}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Dialog
        open={confirm}
        onClose={() => (restoring ? undefined : setConfirm(false))}
        size="sm"
        title={L("استرجاع كامل للمطعم؟", "Restore the whole restaurant?")}
        description={
          moment
            ? L(
                `كل حاجة اتعملت بعد ${dayLabel(moment.toISOString(), lang)} ${clock(moment.toISOString(), lang)} هترجع زي ما كانت: طلبات، مدفوعات، مخزن، منيو وإعدادات (${count ?? 0} حركة). تقدر ترجع عن الاسترجاع نفسه بعدين من نفس الشاشة.`,
                `Everything done after ${dayLabel(moment.toISOString(), lang)} ${clock(moment.toISOString(), lang)} goes back as it was: orders, payments, stock, menu and settings (${count ?? 0} changes). The restore itself can be taken back later from this screen.`,
              )
            : undefined
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="soft" disabled={restoring} onClick={() => setConfirm(false)}>
              {L("رجوع", "Back")}
            </Button>
            <Button variant="danger" loading={restoring} disabled={word.trim() !== WORD} icon={<RotateCcw className="size-4" />} onClick={() => void restore()}>
              {L("استرجع الآن", "Restore now")}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
            {L("الإيصالات اللي اتبعتت لمصلحة الضرائب بتفضل مسجلة عندهم حتى لو رجعت هنا.", "Receipts already sent to the tax authority stay on their side even if they are reversed here.")}
          </p>
          <Input label={L(`للتأكيد اكتب: ${WORD}`, `To confirm, type: ${WORD}`)} value={word} onChange={(e) => setWord(e.target.value)} autoFocus />
        </div>
      </Dialog>
    </div>
  );
}
