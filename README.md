# Shopping Wishlist (with a Claude connector)

A phone-first wishlist you install on your home screen. Save products from any shop by their link, then ask Claude to compare the price across UK shops. Claude saves every shop's price, and the app shows you the cheapest one, how much it has dropped since you saved it, and whether it's under your target price.

- Paste a link (or on Android: browser **Share → Wishlist**) and the name, picture and price are read from the page
- **Best price now**, price when saved, lowest seen, your "buy if under" target
- **Deals** tab: everything that got cheaper or hit your target
- Every shop's latest price, delivery cost, stock and voucher notes, plus full price history
- **Re-check links**: re-reads the saved links and records today's price
- **Compare prices with Claude** button opens Claude with the request ready to send
- **Bought** tab with what you paid and where
- Password-protected; the connector uses its own secret URL
- Tables start with `wl_`, so it can share the same Neon database as the expense tracker

## 1. Deploy on Vercel

1. On vercel.com, click **Add New → Project**, then import this GitHub repo. Leave the defaults and click **Deploy**.
2. Database, pick one:
   - **Reuse the expense tracker's database:** in this project go to **Storage → Connect Database** and pick the existing Neon database. (Safe: different table names.)
   - **Or a new one:** **Storage → Create Database → Neon (Postgres)**, free plan.
   Either way `DATABASE_URL` is set for you and the tables are created on first use.
3. **Settings → Environment Variables**, add:
   - `APP_PASSWORD`: the password you'll type on your phone
   - `MCP_SECRET`: a long random string, at least 16 characters. Use a *different* one from the expense tracker. Anyone who has it can change your wishlist.
4. **Deployments → ⋯ → Redeploy** so the variables take effect.

## 2. Install on your phone

Open `https://<your-project>.vercel.app` and log in.

- **iPhone (Safari):** Share → **Add to Home Screen**, then log in once more inside the app.
- **Android (Chrome):** ⋮ → **Install app**. After installing, "Wishlist" appears in the Share menu of Chrome and shop apps.

## 3. Connect Claude

Claude: **Settings → Connectors → Add custom connector**

- Name: `wishlist`
- URL: `https://<your-project>.vercel.app/api/mcp/<your MCP_SECRET>`

Then, for example:

> "Add this to my wishlist, size UK 9: https://www.skechers.co.uk/…/77156EC_BLK.html"
> "Check prices for the Skechers shoes, is it cheaper anywhere?"
> "What's on my wishlist that's on offer?"
> "I bought the shoes from Sports Direct for £48.99" (Claude can log it in the expense tracker too)

### Connector tools

| Tool | What it does |
|---|---|
| `add_product` | Save a product from its link (details read from the page) |
| `list_products` | Wishlist / bought / dropped, with best price and deals |
| `get_product` | Every shop's latest price and full history |
| `record_prices` | Save prices Claude found at other shops |
| `recheck_saved_links` | Re-read saved links for today's price |
| `update_product` | Size/colour, target price, priority, notes, status |
| `mark_bought` | Record the price paid and the shop |
| `delete_product` / `delete_price` | Remove a product or a wrong price |

## How prices are compared

- "Best price now" = cheapest **in-stock** shop, **including delivery**.
- "When saved" = the first price at the shop you saved it from.
- An item is a **deal** when the best price is lower than when saved, or at/below your target.
- Some shops block automatic page reading. Then the app asks you to type the name and price, or you can just ask Claude, which searches the web instead.

## Local development

```bash
cp .env.example .env.local   # APP_PASSWORD and MCP_SECRET; leave DATABASE_URL as is to use a local database
npm install
npm run dev
```
