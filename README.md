# Vesphe Dashboard (web)

Web dashboard for **vendors** and **admins** — the same accounts, data and rules as the
Vesphe mobile app, on a bigger screen. Customers and riders keep using the mobile apps.

Built with Vite + React + TypeScript + Tailwind. It talks to the same Supabase project and
the same edge functions as the app (payments, refunds, payout accounts, dish auto-fill).

## What's in it

**Vendors** (`/vendor`)
- Dashboard: orders waiting, in progress, today and 7-day earnings, approval/payout banners
- Orders: live updates with a sound for new orders, accept → preparing → ready, reject (card orders are refunded automatically)
- Menu: add/edit dishes, photo upload, auto-fill ingredients from the dish name, allergen detection, meal times, health tags, availability switch
- Earnings: sent to bank (Paystack split), arriving soon, cash orders
- Settings: store details, logo/cover, open/closed, payout bank account (verify → Paystack subaccount)

**Admins** (`/admin`)
- Overview: today's orders, value, commission, and queues needing attention
- Orders: all orders with search/filters, cancel & refund
- Vendors: approve, suspend/reactivate, set payout accounts
- Menu approvals: ingredient/allergen review before dishes go live
- Promotions: approve/reject paid promotions
- Users: search, suspend/reactivate
- Withdrawals: record manual payouts (riders, old wallet balances)
- Settings: commission, delivery fees, promotion price, Vesphe Pro prices

## Run it locally

```sh
cd web
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

Sign in with an existing vendor or admin account from the app.

## Build and deploy

```sh
npm run build             # outputs static files to web/dist
```

Upload the contents of `web/dist` to any static host.

**Option A — subdomain (recommended), e.g. `dashboard.vesphe.com`**
- Keep `VITE_BASE_PATH=/` and build.
- Vercel / Netlify: point the project at the `web` folder (build command `npm run build`,
  output `dist`). `vercel.json` and `public/_redirects` are already included.
- cPanel / Apache: upload `dist/*` to the subdomain's folder. `public/.htaccess` (copied into
  `dist`) makes page refreshes work.
- Add a DNS record for the subdomain pointing to your host.

**Option B — a folder on your existing site, e.g. `vesphe.com/dashboard/`**
- Set `VITE_BASE_PATH=/dashboard/` in `.env`, then build.
- Upload `dist/*` into a `dashboard` folder on the site. On Apache the included `.htaccess`
  handles refreshes; on other servers, rewrite unknown paths under `/dashboard/` to
  `/dashboard/index.html`.

## Security model

The browser only has the public anon key. What each user can read or change is decided by
the database (row-level security policies and the guard triggers in
`supabase/migrations`) and by the edge functions — not by this website. The role checks in
the UI are for navigation only.

## Keep in sync with the app

These are copies of app files; update both when one changes:
- `src/lib/banks.ts` ← `app/constants/banks.ts`
- `src/lib/dishTemplates.ts` ← `app/services/dishTemplates.ts`
- `src/lib/foodSafety.ts` (ALLERGENS list) ← `app/services/foodSafety.ts`
