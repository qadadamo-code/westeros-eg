/** Ready-made lists for a burger restaurant; the manager edits them from the screen. */
import type { ChecklistArea, ChecklistKind } from "@/data/types";

export interface DefaultList {
  k: string;
  ar: string;
  en: string;
  kind: ChecklistKind;
  area: ChecklistArea;
  roles: string[];
  tasks: [ar: string, en: string][];
}

export const DEFAULT_LISTS: DefaultList[] = [
  {
    k: "kitchen-open", ar: "فتح المطبخ", en: "Kitchen opening", kind: "opening", area: "kitchen", roles: ["chef", "kitchen"],
    tasks: [
      ["تشغيل الشفاطات والتأكد من الغاز", "Turn on the hoods and check the gas"],
      ["تسجيل درجة حرارة التلاجات والفريزرات", "Record fridge and freezer temperatures"],
      ["مراجعة ستيكرات الصلاحية وإخراج المنتهي", "Check expiry stickers and remove expired items"],
      ["مراجعة خطة اليوم وبدء التشغيلات المطلوبة", "Review today's plan and start the batches needed"],
      ["تسخين الجريل والفراير وفحص زيت القلي", "Heat the grill and fryer and check the frying oil"],
      ["تجهيز محطة التحضير: صوصات، خضار، عيش", "Set up the line: sauces, vegetables, buns"],
      ["تعقيم الأسطح وألواح التقطيع", "Sanitise surfaces and cutting boards"],
      ["غسل اليدين ولبس الجوانتي وغطاء الرأس", "Wash hands, gloves and hair cover on"],
    ],
  },
  {
    k: "kitchen-close", ar: "قفل المطبخ", en: "Kitchen closing", kind: "closing", area: "kitchen", roles: ["chef", "kitchen"],
    tasks: [
      ["تغطية وتخزين كل المنتجات بستيكر الصلاحية", "Cover and store every product with its expiry sticker"],
      ["تسجيل الهالك في النظام", "Record waste in the system"],
      ["تنظيف الجريل والفراير وتصفية الزيت", "Clean the grill and fryer and filter the oil"],
      ["غسل وتعقيم الأسطح والأرضيات", "Wash and sanitise surfaces and floors"],
      ["تسجيل درجة حرارة التلاجات والفريزرات", "Record fridge and freezer temperatures"],
      ["إخراج القمامة وغسل السلال", "Take out the rubbish and wash the bins"],
      ["قفل الغاز وإطفاء المعدات والشفاطات", "Shut the gas, switch off equipment and hoods"],
      ["كتابة النواقص المطلوبة لبكرة", "Write down what is needed for tomorrow"],
    ],
  },
  {
    k: "cashier-open", ar: "فتح الكاشير", en: "Cashier opening", kind: "opening", area: "cashier", roles: ["cashier"],
    tasks: [
      ["فتح الوردية في النظام وعدّ العهدة", "Open the shift in the system and count the float"],
      ["تجربة الطابعة وماكينة الفيزا", "Test the printer and the card machine"],
      ["التأكد من ورق الطباعة والفكة", "Check receipt paper and change"],
      ["مراجعة الأصناف الموقوفة مع المطبخ", "Review unavailable items with the kitchen"],
      ["تشغيل تابلت طلبات والتأكد من استقبال الطلبات", "Turn on the Talabat tablet and confirm orders come through"],
    ],
  },
  {
    k: "cashier-close", ar: "قفل الكاشير", en: "Cashier closing", kind: "closing", area: "cashier", roles: ["cashier"],
    tasks: [
      ["التأكد من قفل كل الشيكات المفتوحة", "Make sure every open check is closed"],
      ["عدّ الدرج ومطابقته مع النظام", "Count the drawer and match it with the system"],
      ["تقفيل ماكينة الفيزا وإرفاق الإيصال", "Settle the card machine and attach the slip"],
      ["قفل الوردية وتسليم النقدية للمدير", "Close the shift and hand the cash to the manager"],
      ["إيقاف استقبال طلبات الأونلاين", "Stop taking online orders"],
    ],
  },
  {
    k: "floor-open", ar: "فتح الصالة", en: "Floor opening", kind: "opening", area: "floor", roles: ["waiter", "manager"],
    tasks: [
      ["نظافة الترابيزات والكراسي والأرضية", "Tables, chairs and floor are clean"],
      ["نظافة الحمامات وتوفر الصابون والمناديل", "Toilets clean, soap and tissues stocked"],
      ["تشغيل التكييف والإضاءة والموسيقى", "Air conditioning, lights and music on"],
      ["تجهيز المنيو ومحطة الصوصات والمناديل", "Menus, sauce station and napkins ready"],
      ["نظافة الواجهة والمدخل", "Front and entrance are clean"],
    ],
  },
  {
    k: "floor-close", ar: "قفل الصالة", en: "Floor closing", kind: "closing", area: "floor", roles: ["waiter", "manager"],
    tasks: [
      ["مسح الترابيزات ورفع الكراسي", "Wipe tables and put chairs up"],
      ["كنس ومسح الأرضية", "Sweep and mop the floor"],
      ["إخراج القمامة", "Take out the rubbish"],
      ["إطفاء التكييف والإضاءة والشاشات", "Switch off air conditioning, lights and screens"],
      ["قفل الأبواب والتأكد من الكاميرات", "Lock the doors and check the cameras"],
    ],
  },
];

export const defaultRows = () =>
  DEFAULT_LISTS.map((d, i) => ({
    k: d.k,
    row: { name: { ar: d.ar, en: d.en }, kind: d.kind, area: d.area, roles: d.roles, items: d.tasks.map(([ar, en], n) => ({ id: `${d.k}-${n + 1}`, text: { ar, en } })), active: true, sort: i + 1 },
  }));
