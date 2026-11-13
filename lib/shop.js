// Pure helpers shared by the server, the app and the Claude connector. No database here.

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

const TRACKING = /^(utm_.*|srsltid|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|_ga|ref|ref_|tag|affid|aff_id|cmpid|cid|pf_rd_.*|pd_rd_.*|psc|th|spm|scm|_trkparms|_trksid|hash|clickid|irclickid|awc|sv1|sv_campaign_id|sv_tax.*|dclid)$/i;

/** Removes tracking junk from a shop link so the same product is recognised again. */
export function cleanUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`That doesn't look like a link: ${raw}`);
  }
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = '';
  // Amazon: keep only /dp/ASIN.
  if (/amazon\./i.test(u.hostname)) {
    const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (m) return `${u.origin}/dp/${m[1].toUpperCase()}`;
  }
  return u.toString();
}

/** Finds a link inside shared text, e.g. "Look at this! https://…". */
export function findUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/, '') : '';
}

const STORES = {
  'amazon.co.uk': 'Amazon',
  'amazon.com': 'Amazon US',
  'ebay.co.uk': 'eBay',
  'argos.co.uk': 'Argos',
  'very.co.uk': 'Very',
  'currys.co.uk': 'Currys',
  'johnlewis.com': 'John Lewis',
  'next.co.uk': 'Next',
  'asos.com': 'ASOS',
  'schuh.co.uk': 'Schuh',
  'office.co.uk': 'Office',
  'jdsports.co.uk': 'JD Sports',
  'sportsdirect.com': 'Sports Direct',
  'footlocker.co.uk': 'Foot Locker',
  'zalando.co.uk': 'Zalando',
  'skechers.co.uk': 'Skechers',
  'nike.com': 'Nike',
  'adidas.co.uk': 'adidas',
  'boots.com': 'Boots',
  'superdrug.com': 'Superdrug',
  'tesco.com': 'Tesco',
  'sainsburys.co.uk': 'Sainsbury’s',
  'ikea.com': 'IKEA',
  'apple.com': 'Apple',
  'samsung.com': 'Samsung',
  'scan.co.uk': 'Scan',
  'ebuyer.com': 'Ebuyer',
  'box.co.uk': 'Box',
  'aliexpress.com': 'AliExpress',
  'temu.com': 'Temu',
  'shein.co.uk': 'SHEIN',
  'hm.com': 'H&M',
  'zara.com': 'Zara',
  'uniqlo.com': 'Uniqlo',
  'primark.com': 'Primark',
  'tkmaxx.com': 'TK Maxx',
  'mandmdirect.com': 'MandM Direct',
  'decathlon.co.uk': 'Decathlon',
  'screwfix.com': 'Screwfix',
  'toolstation.com': 'Toolstation',
  'wickes.co.uk': 'Wickes',
  'bandq.co.uk': 'B&Q',
  'diy.com': 'B&Q',
  'halfords.com': 'Halfords',
  'backmarket.co.uk': 'Back Market',
  'musicmagpie.co.uk': 'musicMagpie',
  'cex.co.uk': 'CeX',
  'uk.webuy.com': 'CeX',
  'idealo.co.uk': 'idealo',
  'pricespy.co.uk': 'PriceSpy',
  'hotukdeals.com': 'hotukdeals',
  'workwearexpress.com': 'Workwear Express',
  'safetyshoes.co.uk': 'Safety Shoes',
};

export function storeFromUrl(raw) {
  try {
    const host = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\.|^m\./i, '').toLowerCase();
    if (STORES[host]) return STORES[host];
    for (const [k, v] of Object.entries(STORES)) if (host.endsWith('.' + k)) return v;
    const parts = host.split('.');
    // skechers.co.uk -> skechers ; shop.example.com -> example
    const sld = ['co', 'com', 'org', 'net', 'ac'].includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
    const word = sld || parts[0];
    return word ? word[0].toUpperCase() + word.slice(1) : host;
  } catch {
    return '';
  }
}

const sameStore = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Works out the comparison for one product from all its price rows (newest last or any order).
 * Returns the latest price at each shop, the best deal now, the price when saved and the lowest ever.
 */
export function summarise(product, prices) {
  const rows = [...(prices || [])]
    .map((p) => ({
      ...p,
      price: round2(p.price),
      was_price: p.was_price == null ? null : round2(p.was_price),
      delivery: p.delivery == null ? null : round2(p.delivery),
    }))
    .sort((a, b) => String(a.checked_at).localeCompare(String(b.checked_at)) || (a.id || 0) - (b.id || 0));

  const latestByStore = new Map();
  for (const r of rows) latestByStore.set(r.store.trim().toLowerCase(), r);
  const latest = [...latestByStore.values()]
    .map((r) => ({ ...r, total: round2(r.price + (r.delivery || 0)) }))
    .sort((a, b) => (a.in_stock === false) - (b.in_stock === false) || a.total - b.total);

  const buyable = latest.filter((r) => r.in_stock !== false);
  const best = buyable[0] || null;

  const first = rows.find((r) => sameStore(r.store, product.store)) || rows[0] || null;
  const saved_price = first ? first.price : null;
  const inStockRows = rows.filter((r) => r.in_stock !== false);
  const lowest_ever = inStockRows.length ? Math.min(...inStockRows.map((r) => r.price + (r.delivery || 0))) : null;
  const target = product.target_price == null ? null : round2(product.target_price);

  const out = {
    saved_price,
    latest,
    best,
    lowest_ever,
    price_now: best ? best.total : null,
    at_target: Boolean(best && target != null && best.total <= target),
    saving: best && saved_price != null ? round2(saved_price - best.total) : 0,
    shops_checked: latest.length,
  };
  out.is_deal = out.at_target || out.saving > 0.009;
  return out;
}

export function money(n) {
  return n == null ? '—' : `£${Number(n).toFixed(2)}`;
}
