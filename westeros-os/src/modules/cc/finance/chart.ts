/**
 * الشجرة الجاهزة: a starting chart for a burger restaurant with a central kitchen and branches. Every line can be renamed,
 * moved or added to from the screen; "تحميل الشجرة الجاهزة" only adds the codes that are missing.
 * Levels by code length: 1 · 2 · 4 · 6 · 8 digits. The first digit is the type:
 * 1 أصول · 2 التزامات · 3 حقوق الملكية · 4 الإيرادات · 5 تكلفة المبيعات · 6 المصروفات.
 */
import type { FinAccountKind, FinCashflow } from "@/data/financeTypes";

export interface SeedAccount {
  code: string;
  ar: string;
  en: string;
  kind?: FinAccountKind;
  cashflow?: FinCashflow;
  /** posting-rule key (FIN_KEYS) */
  key?: string;
  /** only the system posts here */
  auto?: boolean;
}

const a = (code: string, ar: string, en: string, o: Omit<SeedAccount, "code" | "ar" | "en"> = {}): SeedAccount => ({ code, ar, en, ...o });

export const DEFAULT_TREE: SeedAccount[] = [
  a("1", "الأصول", "Assets"),
  a("11", "الأصول المتداولة", "Current assets"),
  a("1101", "النقدية وما في حكمها", "Cash and cash equivalents", { kind: "cash" }),
  a("110101", "الخزينة الرئيسية", "Main safe", { kind: "cash", key: "cash.main" }),
  a("110102", "خزائن الفروع", "Branch tills", { kind: "cash", key: "cash.branches" }),
  a("110103", "عهد الكاشير", "Cashier floats", { kind: "cash", key: "cash.floats" }),
  a("1102", "البنوك", "Banks", { kind: "bank", key: "banks" }),
  a("1103", "المحافظ والتحصيل الإلكتروني", "Wallets and electronic collection", { kind: "wallet", key: "wallets" }),
  a("110301", "فيزا تحت التسوية", "Card settlement", { kind: "wallet", key: "wallet.card" }),
  a("110302", "انستاباي", "InstaPay", { kind: "wallet", key: "wallet.instapay" }),
  a("110303", "فودافون كاش", "Vodafone Cash", { kind: "wallet", key: "wallet.vodafone" }),
  a("1104", "مستحقات شركات التوصيل", "Delivery companies receivable", { kind: "customer" }),
  a("110401", "طلبات تحت التسوية", "Talabat settlement", { kind: "customer", key: "aggregator.talabat" }),
  a("1105", "العملاء", "Customers", { kind: "customer", key: "customers" }),
  a("1106", "المخزون", "Inventory", { kind: "inventory", auto: true }),
  a("110601", "مخزون الخامات", "Raw materials", { kind: "inventory", key: "stock.raw", auto: true }),
  a("110602", "مخزون المنتجات المصنعة", "Manufactured products", { kind: "inventory", key: "stock.product", auto: true }),
  a("110603", "مخزون التعبئة والتغليف", "Packaging", { kind: "inventory", key: "stock.packaging", auto: true }),
  a("110604", "مخزون المستلزمات", "Supplies", { kind: "inventory", key: "stock.supplies", auto: true }),
  a("1107", "بضاعة بالطريق", "Goods in transit", { kind: "inventory", key: "stock.transit", auto: true }),
  a("1108", "سلف وعهد الموظفين", "Staff advances", { kind: "employee", key: "staff.advances" }),
  a("1109", "مصروفات مدفوعة مقدما", "Prepaid expenses", { key: "prepaid" }),
  a("110901", "إيجار مقدم", "Prepaid rent"),
  a("110902", "تأمين مقدم", "Prepaid insurance"),
  a("1110", "ضريبة القيمة المضافة مدخلات", "Input VAT", { kind: "tax", key: "vat.input" }),
  a("1111", "إنتاج تحت التشغيل", "Work in progress", { kind: "inventory", key: "stock.wip", auto: true }),
  a("12", "الأصول الثابتة", "Fixed assets", { kind: "fixed_asset", cashflow: "investing" }),
  a("1201", "معدات المطبخ", "Kitchen equipment", { kind: "fixed_asset", cashflow: "investing", key: "asset.kitchen" }),
  a("1202", "تجهيزات وديكور", "Fit-out and decor", { kind: "fixed_asset", cashflow: "investing", key: "asset.fitout" }),
  a("1203", "أجهزة وكمبيوتر", "Devices and computers", { kind: "fixed_asset", cashflow: "investing", key: "asset.devices" }),
  a("1204", "سيارات ودراجات توصيل", "Vehicles and delivery bikes", { kind: "fixed_asset", cashflow: "investing", key: "asset.vehicles" }),
  a("1290", "مجمع الإهلاك", "Accumulated depreciation", { kind: "fixed_asset", cashflow: "investing", key: "asset.accumulated" }),

  a("2", "الالتزامات", "Liabilities"),
  a("21", "الالتزامات المتداولة", "Current liabilities"),
  a("2101", "الموردون", "Suppliers", { kind: "supplier", key: "suppliers" }),
  a("2102", "مصروفات مستحقة", "Accrued expenses", { key: "accrued" }),
  a("210201", "رواتب مستحقة", "Salaries payable", { key: "salaries.payable" }),
  a("210202", "كهرباء وغاز ومياه مستحقة", "Utilities payable"),
  a("210203", "إيجار مستحق", "Rent payable"),
  a("2103", "ضريبة القيمة المضافة مخرجات", "Output VAT", { kind: "tax", key: "vat.output" }),
  a("2104", "ضرائب أخرى مستحقة", "Other taxes payable", { kind: "tax" }),
  a("210401", "خصم من المنبع", "Withholding tax", { kind: "tax", key: "tax.withholding" }),
  a("210402", "ضريبة كسب العمل", "Payroll tax", { kind: "tax", key: "tax.payroll" }),
  a("2105", "التأمينات الاجتماعية", "Social insurance", { key: "social.insurance" }),
  a("2106", "إكراميات ورسوم خدمة مستحقة للموظفين", "Tips and service payable to staff", { key: "tips.payable" }),
  a("2107", "أرصدة عملاء مقدمة", "Customer deposits", { kind: "customer", key: "customer.deposits" }),
  a("22", "التزامات طويلة الأجل", "Long-term liabilities", { cashflow: "financing" }),
  a("2201", "قروض", "Loans", { cashflow: "financing", key: "loans" }),

  a("3", "حقوق الملكية", "Equity", { cashflow: "financing" }),
  a("31", "رأس المال والشركاء", "Capital and partners", { cashflow: "financing" }),
  a("3101", "رأس المال", "Capital", { cashflow: "financing", key: "capital" }),
  a("3102", "جاري الشركاء", "Partners current account", { cashflow: "financing", key: "partners" }),
  a("3103", "مسحوبات", "Drawings", { cashflow: "financing", key: "drawings" }),
  a("32", "الأرباح", "Profits"),
  a("3201", "أرباح مرحلة", "Retained earnings", { key: "retained" }),
  a("3202", "أرباح العام", "Profit for the year", { key: "year.profit", auto: true }),
  a("3203", "أرصدة افتتاحية", "Opening balances", { key: "opening" }),

  a("4", "الإيرادات", "Revenue"),
  a("41", "إيرادات النشاط", "Operating revenue"),
  a("4101", "مبيعات الصالة", "Dine-in sales", { key: "sales.dinein" }),
  a("4102", "مبيعات التيك أواي", "Takeaway sales", { key: "sales.takeaway" }),
  a("4103", "مبيعات التوصيل الخاص", "Own delivery sales", { key: "sales.delivery" }),
  a("4104", "مبيعات طلبات", "Talabat sales", { key: "sales.talabat" }),
  a("4105", "رسوم التوصيل", "Delivery fees", { key: "sales.fees" }),
  a("4190", "خصومات ومرتجعات المبيعات", "Sales discounts and returns"),
  a("419001", "خصومات وعروض", "Discounts and offers", { key: "sales.discounts" }),
  a("419002", "مرتجعات المبيعات", "Sales returns", { key: "sales.returns" }),
  a("42", "إيرادات أخرى", "Other income"),
  a("4201", "بيع مخلفات وزيوت", "Scrap and used oil sales", { key: "income.scrap" }),
  a("4202", "فروق جرد بالزيادة", "Stock count surplus", { key: "count.gain", auto: true }),
  a("4203", "خصم مكتسب", "Discounts received", { key: "discount.received" }),
  a("4204", "أرباح بيع أصول", "Gain on disposal of assets", { key: "asset.gain" }),

  a("5", "تكلفة المبيعات", "Cost of sales"),
  a("51", "تكلفة المبيعات", "Cost of sales"),
  a("5101", "تكلفة الخامات المباعة", "Cost of goods sold", { key: "cogs.raw" }),
  a("5102", "تكلفة التعبئة والتغليف", "Packaging cost", { key: "cogs.packaging" }),
  a("5103", "هالك التصنيع", "Manufacturing waste", { key: "waste.mfg", auto: true }),
  a("5104", "هالك وتالف المخازن", "Warehouse waste and spoilage", { key: "waste.store" }),
  a("5105", "فروق الجرد", "Stock count differences", { key: "count.loss", auto: true }),
  a("5106", "وجبات الموظفين والضيافة", "Staff meals and hospitality", { key: "staff.meals" }),
  a("5107", "فروق تصنيع", "Manufacturing variance", { key: "mfg.variance", auto: true }),
  a("5108", "فروق أسعار المخزون", "Inventory price differences", { key: "price.variance", auto: true }),

  a("6", "المصروفات", "Expenses"),
  a("61", "رواتب وأجور", "Salaries and wages"),
  a("6101", "رواتب", "Salaries", { key: "salaries" }),
  a("6102", "إضافي", "Overtime", { key: "overtime" }),
  a("6103", "حوافز ومكافآت", "Bonuses", { key: "bonuses" }),
  a("6104", "تأمينات حصة الشركة", "Social insurance, employer share", { key: "social.employer" }),
  a("62", "مصروفات التشغيل", "Operating expenses"),
  a("6201", "إيجار", "Rent", { key: "exp.rent" }),
  a("6202", "كهرباء", "Electricity", { key: "exp.electricity" }),
  a("6203", "غاز", "Gas", { key: "exp.gas" }),
  a("6204", "مياه", "Water", { key: "exp.water" }),
  a("6205", "صيانة", "Maintenance", { key: "exp.maintenance" }),
  a("6206", "نظافة", "Cleaning", { key: "exp.cleaning" }),
  a("63", "مصروفات البيع والتسويق", "Selling and marketing"),
  a("6301", "عمولة طلبات", "Talabat commission", { key: "exp.talabat" }),
  a("6302", "إعلانات وتسويق", "Advertising and marketing", { key: "exp.marketing" }),
  a("6303", "عمولات بنوك وفيزا", "Bank and card fees", { key: "exp.bankfees" }),
  a("64", "مصروفات إدارية", "Administrative expenses"),
  a("6401", "اتصالات وإنترنت", "Phone and internet", { key: "exp.internet" }),
  a("6402", "اشتراكات برامج", "Software subscriptions", { key: "exp.software" }),
  a("6403", "رسوم حكومية وتراخيص", "Government fees and licences", { key: "exp.licences" }),
  a("6404", "أتعاب محاسبة واستشارات", "Accounting and professional fees", { key: "exp.professional" }),
  a("6405", "مصروفات متنوعة", "Sundry expenses", { key: "exp.other" }),
  a("65", "إهلاك", "Depreciation"),
  a("6501", "مصروف الإهلاك", "Depreciation expense", { key: "exp.depreciation", auto: true }),
  a("66", "فروق وخسائر", "Differences and losses"),
  a("6601", "فروق خزينة", "Cash over and short", { key: "cash.diff" }),
  a("6602", "خسائر بيع أصول", "Loss on disposal of assets", { key: "asset.loss" }),
];

/** key → default code, for ربط الحسابات */
export const DEFAULT_LINKS: Record<string, string> = Object.fromEntries(DEFAULT_TREE.filter((x) => x.key).map((x) => [x.key!, x.code]));
