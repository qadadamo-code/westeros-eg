# Westeros OS

نظام تشغيل مطعم وستروس (مدينة نصر، القاهرة): مطبخ مركزي وتصنيع، كاشير، مخزن ومشتريات، موارد بشرية، مالية وعملاء.
Built on the Sufra OS codebase (Vite + React + TypeScript + Tailwind; data in the browser for demos, Supabase in production).

| Folder | What |
| --- | --- |
| `westeros-os/` | The app. `npm ci && npm run dev` → http://localhost:5173/app/ |
| `westeros-finance/` | Accounting engine used by the app (`@finance`) |
| `api/` | Vercel functions (WhatsApp, e-invoicing, fingerprint device push) |

## Production (التصنيع)

`westeros-os/src/modules/production` turns the "Cost Control" document into the system:

- `calc.ts` — the formulas of the four manufacturing methods (by weight, by portion, from one raw material, burger). Waste is net minus gross, so a loss shows as a negative number.
- `build.ts`, `ops.ts` — a batch (تشغيلة): costed from last purchase prices, signed by the chef, numbered
  `<category>-<DDMMYYYY>#<run>(<chef code>)`, moved through stock, with a lot and expiry per product.
- `Label.tsx` — the batch sticker (product, batch number, production and expiry dates, chef, quantity, QR).
- `src/data/westeros/` — the restaurant's own data: the published menu, staff placeholders, delivery areas. Raw materials, manufactured products and recipes start empty and are entered in the app (the only reference for manufacturing is the "Cost Control System" document; categories, meat cuts and storage methods are constants the restaurant edits).
- `supabase/migrations/0015_production.sql` — tables and row-level security.
- `plan.ts`, `PlanPage.tsx` — today's production plan (خطة اليوم): what to make and how much, from the daily
  minimum (the stock item's `levels.par`), the same weekday's usage over the last four weeks, stock on hand and
  what expires today.
- `variance.ts`, `VariancePage.tsx` — standard vs actual (المعياري والفعلي): each batch against its recipe, by
  chef, product and ingredient, with trimmings.

## Shift checklists (قوائم الوردية)

`westeros-os/src/modules/checklists`: opening and closing lists per area (kitchen, cashier, floor). Every task is
ticked with the name and time of who did it, managers follow the last seven days and edit the lists.
Tables in `supabase/migrations/0016_checklists.sql`.

## History and restore (السجل والاسترجاع)

`supabase/migrations/0017_history.sql` journals every change to the restaurant's data (the row before and after).
Settings → السجل والاسترجاع: a manager undoes one wrong change, the owner takes the whole restaurant back to a moment
within the last 30 days; a restore is itself journalled, so it can be taken back. Database tests:
`supabase/tests/history.sh`.

## Checks

```
cd westeros-os
npm run typecheck && npm test && npm run build
```

Sign-in on the local demo data: pick a name on the PIN screen (PINs are listed in `src/data/westeros/seed.ts`).

## Interface (الواجهة)

- `westeros-os/src/fx/` — visual components adapted to the Westeros identity (black and gold, Arabic RTL): opening
  logo reveal (`Splash.tsx`), sales peak chart, glass section folders, liquid phone dock, and the menu showcase views.
- `westeros-os/src/modules/showcase` — the full-screen menu page (`/showcase`): dishes, conveyor, flavours, drinks, offers.
- `westeros-os/src/data/westeros/menuImages.ts` — item photos, loaded from the restaurant's current ordering page.
