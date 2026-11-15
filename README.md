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

- `calc.ts` — the formulas of the four manufacturing methods (by weight, by portion, chicken, burger) + fat preparation.
- `build.ts`, `ops.ts` — a batch (تشغيلة): costed from last purchase prices, signed by the chef, numbered
  `<category>-<DDMMYYYY>#<run>(<chef code>)`, moved through stock, with a lot and expiry per product.
- `Label.tsx` — the batch sticker (product, batch number, production and expiry dates, chef, quantity, QR).
- `src/data/westeros/` — the restaurant's own data: 282 raw materials, 93 menu items, 37 manufactured products, staff.
- `supabase/migrations/0015_production.sql` — tables and row-level security.

## Checks

```
cd westeros-os
npm run typecheck && npm test && npm run build
```

Sign-in on the local demo data: pick a name on the PIN screen (PINs are listed in `src/data/westeros/seed.ts`).
