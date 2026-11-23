/** الحقول الإضافية: management adds its own fields to any HR form; they show on the form and in the record. */
import { useDb } from "@/data/hooks";
import { useArea } from "../useAccess";
import type { CustomField } from "./model";
import { saveSettings } from "./ops";
import { useHrx } from "./useHrx";
import { ListEditor, ReadOnlyNote, TextList } from "./ui";

export const FORM_KINDS: { id: string; label: string }[] = [
  { id: "file", label: "ملف الموظف" }, { id: "contract", label: "العقد" }, { id: "vacancy", label: "الوظيفة الشاغرة" }, { id: "candidate", label: "المتقدم للوظيفة" },
  { id: "request", label: "الطلب" }, { id: "evaluation", label: "التقييم" }, { id: "course", label: "الدورة التدريبية" }, { id: "warning", label: "الإنذار" }, { id: "exit", label: "نهاية الخدمة" },
  { id: "department", label: "القسم" }, { id: "job", label: "الوظيفة" },
];
const TYPES = [{ value: "text", label: "نص" }, { value: "number", label: "رقم" }, { value: "date", label: "تاريخ" }, { value: "select", label: "اختيار من قائمة" }, { value: "yesno", label: "نعم أو لا" }, { value: "textarea", label: "نص طويل" }];

export default function Fields() {
  const hrx = useHrx();
  const db = useDb();
  const readOnly = !useArea().edit;
  return (
    <div className="grid gap-5">
      <ReadOnlyNote show={readOnly} what="تعديل الحقول الإضافية" />
      <p className="text-[14px] text-muted">أضف أي خانة محتاجها على أي نموذج في الموارد البشرية. الخانة بتظهر في النموذج، ولو مطلوبة ما يتحفظش من غيرها.</p>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {FORM_KINDS.map((k) => (
          <ListEditor<CustomField & { name?: string }> key={k.id} title={k.label} readOnly={readOnly}
            items={(hrx.settings.customFields[k.id] ?? []).map((f) => ({ ...f, name: f.label }))}
            onSave={(items) => saveSettings(db, hrx, { customFields: { ...hrx.settings.customFields, [k.id]: items.map(({ name, ...f }) => ({ ...f, label: name ?? f.label })) } }).then(() => undefined)}
            cols={[{ key: "name", label: "اسم الخانة", type: "text" }, { key: "type", label: "النوع", type: "select", options: TYPES }, { key: "required", label: "مطلوبة", type: "switch" }]}
            blank={() => ({ id: "", label: "", name: "", type: "text" })}
            render={(r, set) => (r.type === "select" ? <TextList items={r.options ?? []} onChange={(options) => set({ ...r, options })} placeholder="اختيار جديد" readOnly={readOnly} /> : <span className="text-[13px] text-muted">مفيش تفاصيل لنوع الخانة ده.</span>)} />
        ))}
      </div>
    </div>
  );
}
