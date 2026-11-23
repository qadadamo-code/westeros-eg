/** الزبائن: بياناتهم، إضافة وتعديل وحذف، واستيراد وتصدير إكسل (المطابقة برقم التليفون)، وتقرير بأكثرهم شراء. */
import { useMemo, useState } from "react";
import { ContactRound, Pencil, Plus, Trash2 } from "lucide-react";
import type { Customer } from "@/data/types";
import { useDb, useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { Button, Card, Dialog, EmptyState, IconButton, Input, Select, Textarea, useToast } from "@/ui";
import { ExcelImport, type ImportPlan } from "../catalog/Import";
import { ExportButton } from "../ui";
import { useFinPerms } from "./perms";
import { Confirm, fmt, Toolbar } from "./ui";

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d+]/g, "");
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
interface Form { name: string; phone: string; email: string; address: string; area: string; birthday: string; gender: "" | "m" | "f"; tags: string; notes: string }
const formOf = (c: Customer | null): Form => ({ name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.addresses?.[0]?.address ?? "", area: c?.addresses?.[0]?.area ?? "", birthday: c?.birthday ?? "", gender: c?.gender ?? "", tags: (c?.tags ?? []).join("، "), notes: c?.notes ?? "" });
const tagsOf = (t: string) => t.split(/[،,]/).map((x) => x.trim()).filter(Boolean);

export default function Customers() {
  const rows = useLive("customers").data;
  const db = useDb();
  const { toast } = useToast();
  const can = useFinPerms().has("customers");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"spent" | "visits" | "name" | "recent">("spent");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const [del, setDel] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const t = q.trim(), p = digits(t);
    const live = rows.filter((c) => !c.mergedInto);
    const hit = t ? live.filter((c) => c.name.includes(t) || (p && digits(c.phone).includes(p)) || c.addresses?.some((a) => a.address.includes(t) || a.area.includes(t)) || c.tags?.some((x) => x.includes(t))) : live;
    const by: Record<typeof sort, (a: Customer, b: Customer) => number> = {
      spent: (a, b) => b.totalSpent - a.totalSpent, visits: (a, b) => b.visits - a.visits, name: (a, b) => a.name.localeCompare(b.name, "ar"), recent: (a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""),
    };
    return [...hit].sort(by[sort]);
  }, [rows, q, sort]);
  const total = rows.filter((c) => !c.mergedInto);
  const spent = total.reduce((s, c) => s + c.totalSpent, 0);

  const importRows = async (sheet: Record<string, string>[], dry: boolean): Promise<ImportPlan> => {
    const plan: ImportPlan = { added: [], updated: [], skipped: 0 };
    const byPhone = new Map(rows.map((c) => [digits(c.phone), c]));
    for (const r of sheet) {
      const phone = digits(r["التليفون"] ?? "");
      const name = (r["الاسم"] ?? "").trim();
      if (!phone) { plan.skipped++; continue; }
      const hit = byPhone.get(phone);
      const addr = (r["العنوان"] ?? "").trim(), zone = (r["المنطقة"] ?? "").trim();
      const fields: Partial<Customer> = {
        ...(name ? { name } : {}), ...(r["البريد"]?.trim() ? { email: r["البريد"].trim() } : {}), ...(r["تاريخ الميلاد"]?.trim() ? { birthday: r["تاريخ الميلاد"].trim().slice(0, 10) } : {}),
        ...(r["ملاحظات"]?.trim() ? { notes: r["ملاحظات"].trim() } : {}), ...(r["التصنيفات"]?.trim() ? { tags: tagsOf(r["التصنيفات"]) } : {}),
      };
      if (hit) {
        plan.updated.push({ code: phone, name: name || hit.name });
        if (!dry) {
          const addresses = addr && !hit.addresses.some((a) => a.address === addr) ? [{ address: addr, area: zone, notes: "", lat: null, lng: null }, ...hit.addresses].slice(0, 5) : hit.addresses;
          await db.update("customers", hit.id, { ...fields, addresses });
        }
      } else {
        if (!name) { plan.skipped++; continue; }
        plan.added.push({ code: phone, name });
        if (!dry) {
          const c = await db.insert("customers", { phone, name, email: null, visits: 0, lastVisitAt: null, totalSpent: 0, loyaltyPoints: 0, tags: [], notes: "", birthday: null, addresses: addr ? [{ address: addr, area: zone, notes: "", lat: null, lng: null }] : [], ...fields });
          byPhone.set(phone, c);
        }
      }
    }
    return plan;
  };

  return (
    <div className="grid gap-4">
      <Toolbar
        lead={<Input aria-label="بحث" placeholder="اسم أو تليفون أو عنوان" className="w-full sm:w-72" value={q} onChange={(e) => setQ(e.target.value)} />}
        actions={can ? <Button icon={<Plus />} onClick={() => setEdit("new")}>زبون جديد</Button> : null}
        more={<>
          <ExportButton file="الزبائن" head={["الاسم", "التليفون", "البريد", "العنوان", "المنطقة", "تاريخ الميلاد", "التصنيفات", "عدد الزيارات", "إجمالي المشتريات", "آخر زيارة", "ملاحظات"]}
            rows={() => list.map((c) => [c.name, c.phone, c.email ?? "", c.addresses?.[0]?.address ?? "", c.addresses?.[0]?.area ?? "", c.birthday ?? "", (c.tags ?? []).join("، "), c.visits, c.totalSpent / 100000, day(c.lastVisitAt), c.notes])} />
          {can ? <ExcelImport noun="زبائن" run={importRows} skipNote="سطر بدون تليفون، أو تليفون جديد بدون اسم. الزبون الموجود بيتعرف برقم التليفون."
            fields={[{ key: "التليفون", aliases: ["phone", "موبايل", "الموبايل", "رقم التليفون", "رقم الموبايل", "تليفون"] }, { key: "الاسم", aliases: ["name", "اسم الزبون", "العميل", "اسم العميل"] }, { key: "العنوان", aliases: ["address"] }, { key: "المنطقة", aliases: ["area", "zone"] }, { key: "البريد", aliases: ["email", "الايميل"] }, { key: "تاريخ الميلاد", aliases: ["birthday", "الميلاد"] }, { key: "التصنيفات", aliases: ["tags"] }, { key: "ملاحظات", aliases: ["notes"] }]} /> : null}
        </>}>
        <Select aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} options={[{ value: "spent", label: "الأكثر شراء" }, { value: "visits", label: "الأكثر زيارة" }, { value: "recent", label: "آخر زيارة" }, { value: "name", label: "الاسم" }]} />
      </Toolbar>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2">
        {[["عدد الزبائن", String(total.length)], ["إجمالي مشترياتهم", fmt(spent)], ["متوسط الزبون", fmt(total.length ? Math.round(spent / total.length) : 0)]].map(([l, v]) => <Card key={l} className="p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="num text-[18px] font-bold" dir="ltr">{v}</div></Card>)}
      </div>

      {list.length ? (
        <Card className="overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-[14px]">
          <thead><tr className="text-[12.5px] text-muted">{["الزبون", "التليفون", "العنوان", "الزيارات", "المشتريات", "آخر زيارة", ""].map((h, i) => <th key={i} className={cn("border-b border-line px-3 py-2.5 font-semibold", i === 3 || i === 4 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
          <tbody>{list.slice(0, 500).map((c) => (
            <tr key={c.id} className="border-t border-line/60">
              <td className="px-3 py-2"><div className="font-semibold">{c.name}</div>{c.tags?.length ? <div className="text-[12px] text-muted">{c.tags.join("، ")}</div> : null}</td>
              <td className="num px-3 py-2" dir="ltr">{c.phone}</td>
              <td className="max-w-[260px] truncate px-3 py-2 text-muted">{[c.addresses?.[0]?.area, c.addresses?.[0]?.address].filter(Boolean).join(" · ") || "—"}</td>
              <td className="num px-3 py-2 text-end">{c.visits || "—"}</td>
              <td className="num px-3 py-2 text-end font-semibold" dir="ltr">{fmt(c.totalSpent, "—")}</td>
              <td className="num px-3 py-2 text-muted">{day(c.lastVisitAt) || "—"}</td>
              <td className="px-3 py-2"><div className="flex justify-end gap-1">
                {can ? <IconButton size="sm" label="تعديل" onClick={() => setEdit(c)}><Pencil /></IconButton> : null}
                {can ? <IconButton size="sm" label="حذف" onClick={() => setDel(c)}><Trash2 /></IconButton> : null}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>{list.length > 500 ? <p className="border-t border-line px-3 py-2 text-[13px] text-muted">ظاهر أول 500 زبون، استخدم البحث للباقي.</p> : null}</Card>
      ) : <Card><EmptyState compact icon={<ContactRound />} title={q ? "لا يوجد زبون بهذا البحث" : "لا يوجد زبائن بعد"} body={q ? undefined : "أضف زبون أو استورد قائمة الزبائن من إكسل."} /></Card>}

      {edit ? <CustomerDialog row={edit === "new" ? null : edit} all={rows} onClose={() => setEdit(null)} /> : null}
      <Confirm open={!!del} danger title="حذف الزبون" confirmLabel="حذف" loading={busy} onClose={() => setDel(null)}
        description={del ? `هيتحذف ${del.name} (${del.phone}) من قائمة الزبائن. تقدر ترجعه من السجل والاسترجاع.` : undefined}
        onConfirm={async () => { if (!del) return; setBusy(true); try { await db.remove("customers", del.id); toast({ tone: "success", title: "تم حذف الزبون" }); setDel(null); } catch (e) { toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error)?.message ?? e) }); } finally { setBusy(false); } }} />
    </div>
  );
}

function CustomerDialog({ row, all, onClose }: { row: Customer | null; all: Customer[]; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [f, setF] = useState<Form>(formOf(row));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const phone = digits(f.phone);
  const twin = phone ? all.find((c) => c.id !== row?.id && digits(c.phone) === phone) : null;
  const problem = !f.name.trim() ? "اكتب اسم الزبون" : phone.length < 5 ? "اكتب رقم التليفون" : twin ? `الرقم ده متسجل لـ ${twin.name}` : "";
  const save = async () => {
    setBusy(true);
    const first = { address: f.address.trim(), area: f.area.trim(), notes: row?.addresses?.[0]?.notes ?? "", lat: row?.addresses?.[0]?.lat ?? null, lng: row?.addresses?.[0]?.lng ?? null };
    const addresses = f.address.trim() || f.area.trim() ? [first, ...(row?.addresses ?? []).slice(1)] : (row?.addresses ?? []).slice(1);
    const fields = { name: f.name.trim(), phone, email: f.email.trim() || null, birthday: f.birthday || null, gender: f.gender || null, tags: tagsOf(f.tags), notes: f.notes.trim(), addresses };
    try {
      if (row) await db.update("customers", row.id, fields);
      else await db.insert("customers", { ...fields, visits: 0, lastVisitAt: null, totalSpent: 0, loyaltyPoints: 0 });
      toast({ tone: "success", title: row ? "تم تعديل الزبون" : "تمت إضافة الزبون" });
      onClose();
    } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? `تعديل ${row.name}` : "زبون جديد"}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] font-semibold text-danger">{problem}</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="الاسم" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label="التليفون" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        <Input label="المنطقة" value={f.area} onChange={(e) => set({ area: e.target.value })} />
        <Input label="العنوان" value={f.address} onChange={(e) => set({ address: e.target.value })} />
        <Input label="البريد الإلكتروني" dir="ltr" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        <Input label="تاريخ الميلاد" dir="ltr" type="date" value={f.birthday} onChange={(e) => set({ birthday: e.target.value })} />
        <Select label="النوع" value={f.gender} onChange={(e) => set({ gender: e.target.value as Form["gender"] })} options={[{ value: "", label: "غير محدد" }, { value: "m", label: "ذكر" }, { value: "f", label: "أنثى" }]} />
        <Input label="التصنيفات" placeholder="مثال: VIP، شركات" value={f.tags} onChange={(e) => set({ tags: e.target.value })} />
        <div className="sm:col-span-2"><Textarea label="ملاحظات" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        {row ? <p className="text-[13px] text-muted sm:col-span-2">زيارات {row.visits || 0} · مشتريات {fmt(row.totalSpent, "0.00")}{row.lastVisitAt ? ` · آخر زيارة ${day(row.lastVisitAt)}` : ""}</p> : null}
      </div>
    </Dialog>
  );
}
