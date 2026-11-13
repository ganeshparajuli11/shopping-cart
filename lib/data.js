import { q as dbQuery } from './db.js';
import { cleanUrl, storeFromUrl, summarise, round2 } from './shop.js';
import { readProductPage } from './scrape.js';

let q = dbQuery;
// Lets tests swap the database for a fake one.
export function _setQuery(fn) {
  q = fn;
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const optNum = (v) => (v === undefined || v === null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? round2(v) : NaN);
const optText = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

export function todayLondon() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

const P_SELECT = `SELECT id, url, store, name, brand, model_code, variant, image_url, target_price::float8 AS target_price,
  priority, status, notes, bought_price::float8 AS bought_price, bought_store, to_char(bought_date, 'YYYY-MM-DD') AS bought_date,
  created_at, updated_at, last_checked_at FROM wl_products`;

const PR_SELECT = `SELECT id, product_id, store, url, price::float8 AS price, was_price::float8 AS was_price, delivery::float8 AS delivery,
  in_stock, note, source, checked_at FROM wl_prices`;

async function attach(products, { history = false } = {}) {
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const prices = await q(`${PR_SELECT} WHERE product_id = ANY($1::int[]) ORDER BY checked_at, id`, [ids]);
  return products.map((p) => {
    const mine = prices.filter((r) => r.product_id === p.id).map((r) => ({ ...r, checked_at: new Date(r.checked_at).toISOString() }));
    const s = summarise(p, mine);
    return { ...p, ...s, ...(history ? { history: [...mine].reverse() } : {}) };
  });
}

export async function getProduct(id, { history = true } = {}) {
  const rows = await q(`${P_SELECT} WHERE id = $1`, [Number(id)]);
  if (!rows[0]) return null;
  return (await attach(rows, { history }))[0];
}

export async function listProducts(opts = {}) {
  const where = [];
  const params = [];
  const status = opts.status || 'wishlist';
  if (status !== 'all') {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    const p = `$${params.length}`;
    where.push(`(name ILIKE ${p} OR brand ILIKE ${p} OR store ILIKE ${p} OR model_code ILIKE ${p} OR notes ILIKE ${p})`);
  }
  const rows = await q(
    `${P_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(bought_date, created_at::date) DESC, id DESC LIMIT 300`,
    params
  );
  let list = await attach(rows);
  if (opts.deals_only) list = list.filter((p) => p.is_deal);
  return list;
}

function cleanPriceRow(r, fallback = {}) {
  const store = optText(r.store) || (r.url ? storeFromUrl(r.url) : null) || fallback.store;
  if (!store) throw new Error('Each price needs a store name or link');
  const price = optNum(r.price);
  if (price == null || Number.isNaN(price)) throw new Error(`Invalid price for ${store}: ${r.price}`);
  const was = optNum(r.was_price);
  const delivery = optNum(r.delivery);
  let url = null;
  if (r.url) url = cleanUrl(r.url);
  return {
    store,
    url,
    price,
    was_price: Number.isNaN(was) || was == null || was <= price ? null : was,
    delivery: Number.isNaN(delivery) ? null : delivery,
    in_stock: r.in_stock === undefined || r.in_stock === null || r.in_stock === '' ? null : Boolean(r.in_stock),
    note: optText(r.note),
  };
}

async function insertPrice(productId, row, source) {
  await q(
    `INSERT INTO wl_prices (product_id, store, url, price, was_price, delivery, in_stock, note, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [productId, row.store, row.url, row.price, row.was_price, row.delivery, row.in_stock, row.note, source]
  );
}

/** Reads a shop link without saving anything (used by the Add screen to fill the form). */
export async function previewUrl(url) {
  return readProductPage(url);
}

/**
 * Saves a product. If name or price are missing, the page is read to fill them in.
 * If the same link is already saved, returns that product instead (duplicate: true).
 */
export async function addProduct(input, { source = 'app' } = {}) {
  const url = cleanUrl(input.url);
  if (!url) throw new Error('A product link is required');
  const dup = await q(`SELECT id FROM wl_products WHERE url = $1 AND status <> 'dropped' LIMIT 1`, [url]);
  if (dup.length) return { duplicate: true, product: await getProduct(dup[0].id) };

  let page = null;
  const needPage = !optText(input.name) || optNum(input.price) == null || !optText(input.image_url);
  if (needPage && input.skip_fetch !== true) page = await readProductPage(url);

  const store = optText(input.store) || page?.store || storeFromUrl(url);
  const name = optText(input.name) || page?.name || '';
  if (!name) throw new Error(page?.reason ? `Couldn't read the product name (${page.reason}). Type the name in.` : 'Product name is required');
  const target = optNum(input.target_price);
  if (Number.isNaN(target)) throw new Error('Invalid target price');
  const priority = ['low', 'normal', 'high'].includes(input.priority) ? input.priority : 'normal';

  const rows = await q(
    `INSERT INTO wl_products (url, store, name, brand, model_code, variant, image_url, target_price, priority, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      url,
      store,
      name,
      optText(input.brand) || optText(page?.brand),
      optText(input.model_code) || optText(page?.model_code),
      optText(input.variant),
      optText(input.image_url) || optText(page?.image_url),
      target,
      priority,
      optText(input.notes),
    ]
  );
  const id = rows[0].id;
  const price = optNum(input.price) ?? page?.price ?? null;
  if (price != null && !Number.isNaN(price)) {
    await insertPrice(
      id,
      cleanPriceRow(
        {
          store,
          url,
          price,
          was_price: input.was_price ?? page?.was_price,
          delivery: input.delivery,
          in_stock: input.in_stock ?? page?.in_stock,
          note: page?.note || 'Price when saved',
        },
        { store }
      ),
      source
    );
    await q(`UPDATE wl_products SET last_checked_at = now() WHERE id = $1`, [id]);
  }
  return { duplicate: false, product: await getProduct(id), ...(page && !page.ok ? { page_note: page.reason } : {}) };
}

const EDITABLE = ['url', 'store', 'name', 'brand', 'model_code', 'variant', 'image_url', 'target_price', 'priority', 'status', 'notes', 'bought_price', 'bought_store', 'bought_date'];

export async function updateProduct(id, fields) {
  const current = await getProduct(id, { history: false });
  if (!current) throw new Error(`Product ${id} not found`);
  const sets = [];
  const params = [Number(id)];
  for (const k of EDITABLE) {
    if (!(k in fields)) continue;
    let v = fields[k];
    if (k === 'url') v = cleanUrl(v);
    else if (k === 'target_price' || k === 'bought_price') {
      v = optNum(v);
      if (Number.isNaN(v)) throw new Error(`Invalid ${k}`);
    } else if (k === 'priority' && !['low', 'normal', 'high'].includes(v)) throw new Error('priority must be low, normal or high');
    else if (k === 'status' && !['wishlist', 'bought', 'dropped'].includes(v)) throw new Error('status must be wishlist, bought or dropped');
    else if (k === 'bought_date') {
      v = optText(v);
      if (v && !isDate(v)) throw new Error('bought_date must be YYYY-MM-DD');
    } else if (k === 'name') {
      v = String(v || '').trim();
      if (!v) throw new Error('Name cannot be empty');
    } else v = optText(v);
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  if (sets.length) await q(`UPDATE wl_products SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  return getProduct(id);
}

export async function deleteProduct(id) {
  const rows = await q(`DELETE FROM wl_products WHERE id = $1 RETURNING id`, [Number(id)]);
  return rows.length > 0;
}

/** Records prices found at one or more shops (e.g. Claude's comparison). */
export async function recordPrices(productId, list, { source = 'claude' } = {}) {
  const product = await getProduct(productId, { history: false });
  if (!product) throw new Error(`Product ${productId} not found`);
  const saved = [];
  const skipped = [];
  for (const raw of list || []) {
    try {
      const row = cleanPriceRow(raw);
      await insertPrice(product.id, row, source);
      saved.push(row);
    } catch (e) {
      skipped.push({ reason: e.message, item: raw });
    }
  }
  if (saved.length) await q(`UPDATE wl_products SET last_checked_at = now() WHERE id = $1`, [product.id]);
  return { saved: saved.length, skipped, product: await getProduct(product.id) };
}

/** Re-reads the saved link of each product and records the price it shows now. */
export async function recheckSaved(ids) {
  const products = ids?.length ? (await Promise.all(ids.map((i) => getProduct(i, { history: false })))).filter(Boolean) : await listProducts({ status: 'wishlist' });
  const results = await Promise.all(
    products.slice(0, 25).map(async (p) => {
      const page = await readProductPage(p.url);
      if (page.price == null) return { id: p.id, name: p.name, ok: false, reason: page.reason || 'No price found' };
      const before = p.latest.find((r) => r.store.toLowerCase() === String(p.store || '').toLowerCase());
      await insertPrice(p.id, cleanPriceRow({ store: p.store, url: p.url, price: page.price, was_price: page.was_price, in_stock: page.in_stock, note: 'Re-checked' }), 'recheck');
      await q(`UPDATE wl_products SET last_checked_at = now() WHERE id = $1`, [p.id]);
      return { id: p.id, name: p.name, ok: true, store: p.store, price: page.price, previous: before ? before.price : null, in_stock: page.in_stock };
    })
  );
  return results;
}

export async function markBought(id, { price, store, date, notes } = {}) {
  const p = await getProduct(id, { history: false });
  if (!p) throw new Error(`Product ${id} not found`);
  const fields = {
    status: 'bought',
    bought_price: price ?? p.best?.total ?? p.saved_price,
    bought_store: store || p.best?.store || p.store,
    bought_date: date && isDate(date) ? date : todayLondon(),
  };
  if (notes) fields.notes = [p.notes, notes].filter(Boolean).join('\n');
  return updateProduct(id, fields);
}

export async function deletePrice(id) {
  const rows = await q(`DELETE FROM wl_prices WHERE id = $1 RETURNING id`, [Number(id)]);
  return rows.length > 0;
}

export async function getStats() {
  const list = await listProducts({ status: 'wishlist' });
  const bought = await q(`SELECT COUNT(*)::int AS n, COALESCE(SUM(bought_price),0)::float8 AS spent FROM wl_products WHERE status = 'bought'`);
  return {
    wishlist_count: list.length,
    wishlist_total_now: round2(list.reduce((s, p) => s + (p.price_now || p.saved_price || 0), 0)),
    deals: list.filter((p) => p.is_deal).length,
    bought_count: bought[0].n,
    bought_spent: round2(bought[0].spent),
  };
}
