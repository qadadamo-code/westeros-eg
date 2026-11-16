/**
 * Where Westeros delivers and what it charges, as published on the restaurant's own ordering page
 * (westeros.bonbell.online, read 2026-11-16): area, delivery fee in EGP and the delivery time in minutes.
 * The page gives no minimum order and no map shapes, so those start empty; the manager edits zones in Delivery > Zones.
 */
export const WESTEROS_ORIGIN = { lat: 30.0604725, lng: 31.3335067 };

export const WESTEROS_ZONES: { slug: string; group: string; ar: string; fee: number; eta: number; color: string }[] = [
  { slug: "area-01", group: "مدينة نصر", ar: "جنينة مول", fee: 35, eta: 30, color: "#0d5a53" },
  { slug: "area-02", group: "مدينة نصر", ar: "مكرم عبيد", fee: 40, eta: 35, color: "#0d5a53" },
  { slug: "area-03", group: "مدينة نصر", ar: "عباس العقاد", fee: 40, eta: 30, color: "#0d5a53" },
  { slug: "area-04", group: "مدينة نصر", ar: "حديقة الطفل", fee: 40, eta: 30, color: "#0d5a53" },
  { slug: "area-05", group: "مدينة نصر", ar: "حسن المأمون", fee: 45, eta: 30, color: "#0d5a53" },
  { slug: "area-06", group: "مدينة نصر", ar: "الحديقة الدولية", fee: 40, eta: 30, color: "#0d5a53" },
  { slug: "area-07", group: "مدينة نصر", ar: "شارع الطاقة", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-08", group: "مدينة نصر", ar: "السراج مول", fee: 45, eta: 30, color: "#0d5a53" },
  { slug: "area-09", group: "مدينة نصر", ar: "شارع الطيران", fee: 45, eta: 35, color: "#0d5a53" },
  { slug: "area-10", group: "مدينة نصر", ar: "يوسف عباس", fee: 45, eta: 30, color: "#0d5a53" },
  { slug: "area-11", group: "مدينة نصر", ar: "ذاكر حسين", fee: 45, eta: 30, color: "#0d5a53" },
  { slug: "area-12", group: "مدينة نصر", ar: "شارع أحمد الزمر", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-13", group: "مدينة نصر", ar: "امتداد رمسيس", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-14", group: "مدينة نصر", ar: "مساكن الشروق", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-15", group: "مدينة نصر", ar: "مصطفى النحاس", fee: 45, eta: 30, color: "#0d5a53" },
  { slug: "area-16", group: "مدينة نصر", ar: "الوفاء والأمل", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-17", group: "مدينة نصر", ar: "سيتي ستارز", fee: 50, eta: 30, color: "#0d5a53" },
  { slug: "area-18", group: "مدينة نصر", ar: "زهراء مدينة نصر", fee: 65, eta: 30, color: "#0d5a53" },
  { slug: "area-19", group: "مدينة نصر", ar: "نادي السكة الحديد", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-20", group: "مدينة نصر", ar: "الحي العاشر والواحة", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-21", group: "مدينة نصر", ar: "شارع حسن شريف", fee: 60, eta: 30, color: "#0d5a53" },
  { slug: "area-22", group: "مدينة نصر", ar: "امتداد مصطفى النحاس بعد المنهل", fee: 60, eta: 60, color: "#0d5a53" },
  { slug: "area-23", group: "مدينة نصر", ar: "حي السفارات", fee: 50, eta: 30, color: "#0d5a53" },
  { slug: "area-24", group: "مصر الجديدة", ar: "أرض الجولف", fee: 50, eta: 30, color: "#6b4fa0" },
  { slug: "area-25", group: "مصر الجديدة", ar: "شارع ألماظة", fee: 60, eta: 30, color: "#6b4fa0" },
  { slug: "area-26", group: "مصر الجديدة", ar: "مصر الجديدة", fee: 60, eta: 30, color: "#6b4fa0" },
  { slug: "area-27", group: "شيراتون", ar: "شيراتون", fee: 70, eta: 40, color: "#a8700c" },
  { slug: "area-28", group: "النزهة", ar: "النزهة الجديدة", fee: 80, eta: 60, color: "#2f6f9f" },
  { slug: "area-29", group: "النزهة", ar: "ميدان ألف مسكن", fee: 70, eta: 60, color: "#2f6f9f" },
  { slug: "area-30", group: "جاردينيا وتاج", ar: "جاردينيا سيتي", fee: 75, eta: 60, color: "#b4531f" },
  { slug: "area-31", group: "جاردينيا وتاج", ar: "تاج سلطان", fee: 75, eta: 60, color: "#b4531f" },
  { slug: "area-32", group: "العباسية والحدائق", ar: "العباسية", fee: 80, eta: 60, color: "#1d7f4a" },
  { slug: "area-33", group: "العباسية والحدائق", ar: "الحدائق", fee: 80, eta: 60, color: "#1d7f4a" },
];
