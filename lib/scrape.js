// Reads a product page and pulls out name, price, picture and stock, using the data
// shops publish for Google (JSON-LD "Product") and social previews (Open Graph tags).
// Many shops do this; some block automated visits, in which case Claude fills the gaps.
import { cleanUrl, storeFromUrl, round2 } from './shop.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&pound;/g, '£')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function meta(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (a) return decode(a[1]);
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, 'i'));
  return b ? decode(b[1]) : '';
}

function walk(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  const t = [].concat(node['@type'] || []).map(String);
  if (t.includes('Product') || t.includes('ProductGroup')) out.push(node);
  if (node['@graph']) walk(node['@graph'], out);
  if (node.mainEntity) walk(node.mainEntity, out);
  if (node.itemListElement) walk(node.itemListElement, out);
}

function jsonLdProducts(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    try {
      walk(JSON.parse(raw), out);
    } catch {
      try {
        walk(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')), out);
      } catch {
        /* ignore broken blocks */
      }
    }
  }
  return out;
}

function firstImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  return img.url || img.contentUrl || '';
}

function readOffers(offers) {
  const list = [].concat(offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  let best = null;
  for (const o of list) {
    const spec = [].concat(o.priceSpecification || [])[0] || {};
    const price = num(o.price ?? o.lowPrice ?? spec.price);
    if (price == null) continue;
    const cur = o.priceCurrency || spec.priceCurrency || '';
    const avail = String(o.availability || '');
    const in_stock = avail ? !/OutOfStock|SoldOut|Discontinued/i.test(avail) : null;
    if (!best || (in_stock !== false && (best.in_stock === false || price < best.price))) best = { price, currency: cur, in_stock };
  }
  return best;
}

/** Pure: extracts product details from page HTML. */
export function parseProductHtml(html, url) {
  html = String(html || '');
  const r = { name: '', brand: '', image_url: '', price: null, was_price: null, currency: '', in_stock: null, model_code: '' };

  for (const p of jsonLdProducts(html)) {
    r.name ||= decode(p.name);
    const brand = p.brand && (typeof p.brand === 'string' ? p.brand : p.brand.name);
    r.brand ||= decode(brand);
    r.image_url ||= firstImage(p.image);
    r.model_code ||= decode(p.mpn || p.sku || p.productGroupID || p.model || '');
    let o = readOffers(p.offers);
    if (!o && p.hasVariant) o = readOffers([].concat(p.hasVariant).map((v) => v.offers));
    if (o && r.price == null) Object.assign(r, { price: o.price, currency: o.currency, in_stock: o.in_stock });
  }

  r.name ||= meta(html, 'og:title') || meta(html, 'twitter:title') || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  r.image_url ||= meta(html, 'og:image') || meta(html, 'og:image:secure_url') || meta(html, 'twitter:image');
  r.brand ||= meta(html, 'product:brand') || meta(html, 'og:brand');
  if (r.price == null) {
    r.price = num(meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price') || meta(html, 'twitter:data1'));
    r.currency ||= meta(html, 'product:price:currency') || meta(html, 'og:price:currency') || meta(html, 'priceCurrency');
  }
  const was = num(meta(html, 'product:original_price:amount') || meta(html, 'og:original_price:amount'));
  if (was && r.price && was > r.price) r.was_price = was;
  if (r.in_stock == null) {
    const av = meta(html, 'product:availability') || meta(html, 'og:availability');
    if (av) r.in_stock = !/out|oos|sold/i.test(av);
  }

  // Tidy the name: drop " | Shop name" style suffixes.
  const store = storeFromUrl(url);
  if (r.name && store) {
    const parts = r.name.split(/\s+[|–—-]\s+/);
    if (parts.length > 1 && parts[parts.length - 1].toLowerCase().includes(store.toLowerCase())) r.name = parts.slice(0, -1).join(' - ');
  }
  if (r.image_url && r.image_url.startsWith('//')) r.image_url = 'https:' + r.image_url;
  if (r.image_url && r.image_url.startsWith('/')) {
    try {
      r.image_url = new URL(r.image_url, url).toString();
    } catch {}
  }
  if (r.currency && r.currency.toUpperCase() !== 'GBP') r.note = `Price shown in ${r.currency.toUpperCase()}`;
  return r;
}

/** Fetches a shop page and reads it. Never throws: returns { ok: false, reason } instead. */
export async function readProductPage(rawUrl, { timeoutMs = 9000 } = {}) {
  let url;
  try {
    url = cleanUrl(rawUrl);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  const store = storeFromUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!res.ok) {
      return { ok: false, url, store, reason: res.status === 403 || res.status === 429 || res.status === 503 ? `${store || 'The shop'} blocked the automatic check` : `The page returned ${res.status}` };
    }
    // Read at most ~2 MB.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 2_000_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const data = parseProductHtml(html, url);
    const found = Boolean(data.name || data.price);
    return { ok: found, url, store, ...data, ...(data.price == null ? { reason: 'Could not find the price on the page' } : {}) };
  } catch (e) {
    return { ok: false, url, store, reason: e.name === 'AbortError' ? 'The shop took too long to answer' : `Could not open the page (${e.message})` };
  } finally {
    clearTimeout(timer);
  }
}
