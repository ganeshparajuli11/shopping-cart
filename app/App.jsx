'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findUrl } from '@/lib/shop';

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (n) => (n == null ? '—' : gbp.format(Number(n) || 0));

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function shortDate(d) {
  if (!d) return '';
  return new Date(d.length === 10 ? d + 'T00:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Not logged in');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function claudeLink(p) {
  const text = `Using my wishlist connector, compare prices for wishlist item #${p.id} (${p.name}${p.variant ? `, ${p.variant}` : ''}) across UK shops, save what you find, and tell me if I should buy now.`;
  return `https://claude.ai/new?q=${encodeURIComponent(text)}`;
}

export default function App() {
  const [tab, setTab] = useState('wishlist');
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState(null); // null | { mode: 'add', url } | { mode: 'view', id }
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Opened from the phone's Share menu: "Share → Wishlist".
    const sp = new URLSearchParams(window.location.search);
    const shared = sp.get('url') || findUrl(sp.get('text')) || findUrl(sp.get('title'));
    if (shared) {
      setSheet({ mode: 'add', url: shared });
      window.history.replaceState(null, '', '/');
    }
  }, []);

  // Reload when coming back to the app (e.g. after Claude checked prices).
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const open = (p) => setSheet({ mode: 'view', id: p.id, initial: p });

  return (
    <div className="app">
      <main className="content">
        {tab === 'wishlist' && <Wishlist version={version} onOpen={open} refresh={refresh} />}
        {tab === 'deals' && <Deals version={version} onOpen={open} />}
        {tab === 'bought' && <Bought version={version} onOpen={open} />}
      </main>

      <nav className="tabbar">
        <div className="tabbar-glass">
          <TabButton icon={<IconBag />} label="Wishlist" active={tab === 'wishlist'} onClick={() => setTab('wishlist')} />
          <TabButton icon={<IconTag />} label="Deals" active={tab === 'deals'} onClick={() => setTab('deals')} />
          <button className="fab" aria-label="Add product" onClick={() => setSheet({ mode: 'add' })}>
            <IconPlus />
          </button>
          <TabButton icon={<IconCheck />} label="Bought" active={tab === 'bought'} onClick={() => setTab('bought')} />
          <TabButton icon={<IconRefresh />} label="Refresh" onClick={refresh} />
        </div>
      </nav>

      {sheet?.mode === 'add' && (
        <AddSheet
          initialUrl={sheet.url}
          onClose={() => setSheet(null)}
          onSaved={(p) => {
            refresh();
            setSheet({ mode: 'view', id: p.id, initial: p });
          }}
        />
      )}
      {sheet?.mode === 'view' && <ProductSheet id={sheet.id} initial={sheet.initial} onClose={() => setSheet(null)} onChanged={refresh} />}
    </div>
  );
}

function TabButton({ icon, label, active, onClick }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Line icons in the style of iOS SF Symbols.
function Svg({ children, size = 24, stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function IconBag({ size }) {
  return (
    <Svg size={size}>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </Svg>
  );
}
function IconTag() {
  return (
    <Svg>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="8" cy="8" r="1.4" />
    </Svg>
  );
}
function IconCheck() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </Svg>
  );
}
function IconRefresh() {
  return (
    <Svg>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v5h-5" />
    </Svg>
  );
}
function IconPlus() {
  return (
    <Svg size={26} stroke={2.6}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
function IconOut() {
  return (
    <Svg size={16} stroke={2.2}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

function useLoad(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/* ---------------- Lists ---------------- */

function Wishlist({ version, onOpen, refresh }) {
  const [search, setSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');
  const res = useLoad(() => api(`/api/products?status=wishlist${search ? `&search=${encodeURIComponent(search)}` : ''}`), [version, search]);
  const s = res.data?.stats;
  const items = res.data?.products || [];

  async function recheckAll() {
    setChecking(true);
    setMsg('');
    try {
      const { results } = await api('/api/recheck', { method: 'POST' });
      const okN = results.filter((r) => r.ok).length;
      const changed = results.filter((r) => r.ok && r.previous != null && r.previous !== r.price);
      setMsg(
        `Checked ${okN} of ${results.length} saved links.` +
          (changed.length ? ` Price changed: ${changed.map((c) => `${c.name.slice(0, 24)} ${money(c.previous)} → ${money(c.price)}`).join(', ')}.` : ' No price changes.') +
          (okN < results.length ? ' Some shops block automatic checks — ask Claude for those.' : '')
      );
      refresh();
    } catch (e) {
      setMsg(e.message);
    }
    setChecking(false);
  }

  return (
    <>
      <header className="top">
        <h1>Wishlist</h1>
      </header>
      {s && (
        <section className="card stats">
          <div className="stat">
            <span>Items</span>
            <strong>{s.wishlist_count}</strong>
          </div>
          <div className="stat">
            <span>All at best price</span>
            <strong>{money(s.wishlist_total_now)}</strong>
          </div>
          <div className="stat wide row-between">
            <span>{s.deals ? `🔥 ${s.deals} item${s.deals > 1 ? 's' : ''} cheaper than when saved` : 'No price drops yet'}</span>
            <button className="link small" onClick={recheckAll} disabled={checking || !s.wishlist_count}>
              {checking ? 'Checking…' : 'Re-check links'}
            </button>
          </div>
          {msg && <p className="small muted wide">{msg}</p>}
        </section>
      )}
      {(items.length > 0 || search) && <input type="search" placeholder="Search name, brand, shop…" value={search} onChange={(e) => setSearch(e.target.value)} />}
      <ProductList
        state={res}
        onOpen={onOpen}
        empty={
          search ? (
            'Nothing matches.'
          ) : (
            <div className="empty">
              <IconBag size={40} />
              <p>
                <strong>Nothing saved yet</strong>
              </p>
              <p className="muted small">Tap + and paste a product link, use your browser's Share → Wishlist, or send Claude the link.</p>
            </div>
          )
        }
      />
    </>
  );
}

function Deals({ version, onOpen }) {
  const res = useLoad(() => api(`/api/products?status=wishlist&deals_only=1`), [version]);
  const items = res.data?.products || [];
  const totalSaving = items.reduce((s, p) => s + Math.max(p.saving || 0, 0), 0);
  return (
    <>
      <header className="top">
        <h1>Deals</h1>
        <p className="muted small">Items now cheaper than when you saved them, or at your target price.</p>
      </header>
      {items.length > 0 && (
        <section className="card stat">
          <span>You'd save</span>
          <strong className="pos">{money(totalSaving)}</strong>
        </section>
      )}
      <ProductList state={res} onOpen={onOpen} empty="No deals right now. Ask Claude to compare prices, or re-check your links." />
    </>
  );
}

function Bought({ version, onOpen }) {
  const res = useLoad(() => api(`/api/products?status=bought`), [version]);
  const s = res.data?.stats;
  return (
    <>
      <header className="top">
        <h1>Bought</h1>
      </header>
      {s && s.bought_count > 0 && (
        <section className="card stats">
          <div className="stat">
            <span>Items</span>
            <strong>{s.bought_count}</strong>
          </div>
          <div className="stat">
            <span>Spent</span>
            <strong>{money(s.bought_spent)}</strong>
          </div>
        </section>
      )}
      <ProductList state={res} onOpen={onOpen} bought empty="Things you buy will show here." />
    </>
  );
}

function ProductList({ state, onOpen, empty, bought }) {
  if (state.loading && !state.data) return <div className="card muted center">Loading…</div>;
  if (state.error) return <div className="card error">{state.error}</div>;
  const items = state.data?.products || [];
  if (!items.length) return <div className="card muted center">{empty}</div>;
  return (
    <ul className="products">
      {items.map((p) => (
        <li key={p.id} className="card product" onClick={() => onOpen(p)}>
          <Thumb src={p.image_url} />
          <div className="p-main">
            <div className="p-name">
              {p.priority === 'high' && <span className="dot" title="High priority" />}
              {p.name}
            </div>
            <div className="p-sub">{[p.variant, p.store].filter(Boolean).join(' · ')}</div>
            {bought ? (
              <div className="p-sub">
                Bought {shortDate(p.bought_date)}
                {p.bought_store ? ` at ${p.bought_store}` : ''}
              </div>
            ) : (
              <Badges p={p} />
            )}
          </div>
          <div className="p-price">
            <strong>{money(bought ? p.bought_price : p.price_now ?? p.saved_price)}</strong>
            {!bought && p.best && p.saved_price != null && p.best.total !== p.saved_price && <s className="muted small">{money(p.saved_price)}</s>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Badges({ p }) {
  const out = [];
  if (p.at_target) out.push(<span key="t" className="badge good">Target hit</span>);
  if (p.saving > 0.009) out.push(<span key="s" className="badge good">↓ {money(p.saving)}</span>);
  if (p.saving < -0.009) out.push(<span key="u" className="badge bad">↑ {money(-p.saving)}</span>);
  if (p.best && p.store && p.best.store.toLowerCase() !== p.store.toLowerCase()) out.push(<span key="b" className="badge">Best at {p.best.store}</span>);
  if (!p.best && p.latest?.length) out.push(<span key="o" className="badge bad">Out of stock</span>);
  if (p.shops_checked > 1) out.push(<span key="n" className="badge plain">{p.shops_checked} shops</span>);
  if (!p.latest?.length) out.push(<span key="np" className="badge plain">No price yet</span>);
  return out.length ? <div className="badges">{out}</div> : null;
}

function Thumb({ src, big }) {
  const [bad, setBad] = useState(false);
  return (
    <div className={`thumb ${big ? 'big' : ''}`}>
      {src && !bad ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <IconBag size={big ? 48 : 26} />}
    </div>
  );
}

/* ---------------- Add ---------------- */

function AddSheet({ initialUrl, onClose, onSaved }) {
  const [url, setUrl] = useState(initialUrl || '');
  const [f, setF] = useState({ name: '', price: '', variant: '', target_price: '', priority: 'normal', notes: '', image_url: '', brand: '', model_code: '' });
  const [preview, setPreview] = useState(null); // result of reading the page
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastRead = useRef('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function read(u = url) {
    const link = findUrl(u) || u.trim();
    if (!link || link === lastRead.current) return;
    lastRead.current = link;
    setUrl(link);
    setReading(true);
    setError('');
    try {
      const r = await api('/api/preview', { method: 'POST', body: { url: link } });
      setPreview(r);
      setF((x) => ({
        ...x,
        name: x.name || r.name || '',
        price: x.price || (r.price != null ? String(r.price) : ''),
        image_url: r.image_url || x.image_url,
        brand: r.brand || x.brand,
        model_code: r.model_code || x.model_code,
      }));
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    }
    setReading(false);
  }

  useEffect(() => {
    if (initialUrl) read(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setUrl(t.trim());
        read(t);
      }
    } catch {
      setError('Allow clipboard access, or long-press the box and paste.');
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = { url, ...f, skip_fetch: Boolean(preview) };
      const r = await api('/api/products', { method: 'POST', body });
      onSaved(r.product);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const canSave = url.trim() && (f.name.trim() || !preview) && !busy && !reading;

  return (
    <Sheet onClose={onClose}>
      <h2>Add a product</h2>
      <div className="row url-row">
        <input
          inputMode="url"
          placeholder="Paste product link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => read()}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t) setTimeout(() => read(t), 0);
          }}
          autoFocus={!initialUrl}
        />
        <button className="chip" onClick={paste}>
          Paste
        </button>
      </div>

      {reading && <div className="muted small">Reading the shop page…</div>}
      {preview && !reading && (
        <div className="preview">
          <Thumb src={f.image_url} />
          <div className="p-main">
            <div className="p-name">{f.name || 'Unknown product'}</div>
            <div className="p-sub">
              {preview.store}
              {preview.price != null ? ` · ${money(preview.price)}` : ''}
              {preview.in_stock === false ? ' · out of stock' : ''}
            </div>
            {!preview.ok || preview.price == null ? (
              <div className="small warn">{preview.reason || 'Some details are missing'}. Fill them in below, or just save and ask Claude to finish it.</div>
            ) : null}
          </div>
        </div>
      )}

      {(preview || url) && (
        <>
          <label className="field">
            <span>Name</span>
            <input value={f.name} onChange={set('name')} placeholder="e.g. Skechers Work Nampa" />
          </label>
          <div className="row">
            <label className="field">
              <span>Price now (£)</span>
              <input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0.00" />
            </label>
            <label className="field">
              <span>Buy if under (£)</span>
              <input inputMode="decimal" value={f.target_price} onChange={set('target_price')} placeholder="optional" />
            </label>
          </div>
          <label className="field">
            <span>Size / colour / version</span>
            <input value={f.variant} onChange={set('variant')} placeholder="e.g. UK 9, Black" />
          </label>
          <div className="field">
            <span>Priority</span>
            <div className="seg full">
              {['low', 'normal', 'high'].map((k) => (
                <button key={k} className={f.priority === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, priority: k }))}>
                  {k === 'high' ? 'Need it' : k === 'normal' ? 'Want it' : 'Someday'}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Notes</span>
            <input value={f.notes} onChange={set('notes')} placeholder="optional" />
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={save} disabled={!canSave}>
        {busy ? 'Saving…' : 'Save to wishlist'}
      </button>
    </Sheet>
  );
}

/* ---------------- Product detail ---------------- */

function ProductSheet({ id, initial, onClose, onChanged }) {
  const [p, setP] = useState(initial || null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState(null); // 'edit' | 'price' | 'buy' | 'history'
  const [note, setNote] = useState('');

  useEffect(() => {
    api(`/api/products/${id}`)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [id]);

  async function run(label, fn) {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  }

  const recheck = () =>
    run('recheck', async () => {
      const r = await api(`/api/products/${id}/recheck`, { method: 'POST' });
      setP(r.product);
      const x = r.result;
      setNote(x?.ok ? (x.previous != null && x.previous !== x.price ? `Price changed: ${money(x.previous)} → ${money(x.price)}` : `Still ${money(x.price)} at ${x.store}`) : x?.reason || 'Could not check');
      onChanged();
    });

  const patch = (body, after) =>
    run('save', async () => {
      const next = await api(`/api/products/${id}`, { method: 'PATCH', body });
      setP(next);
      setPanel(null);
      onChanged();
      after?.();
    });

  const remove = () =>
    run('delete', async () => {
      if (!window.confirm('Delete this product and its price history?')) return;
      await api(`/api/products/${id}`, { method: 'DELETE' });
      onChanged();
      onClose();
    });

  const removePrice = (priceId) =>
    run('price', async () => {
      setP(await api(`/api/products/${id}/prices?price_id=${priceId}`, { method: 'DELETE' }));
      onChanged();
    });

  if (!p) {
    return (
      <Sheet onClose={onClose}>
        <div className="muted center">{error || 'Loading…'}</div>
      </Sheet>
    );
  }

  const isBought = p.status === 'bought';

  return (
    <Sheet onClose={onClose}>
      <div className="detail-head">
        <Thumb src={p.image_url} big />
        <div className="p-main">
          {p.brand && <div className="p-sub">{p.brand}</div>}
          <h2 className="detail-name">{p.name}</h2>
          <div className="p-sub">{[p.variant, p.model_code && `Code ${p.model_code}`].filter(Boolean).join(' · ')}</div>
          <a className="link small" href={p.url} target="_blank" rel="noreferrer">
            Open at {p.store || 'shop'} <IconOut />
          </a>
        </div>
      </div>

      {isBought ? (
        <div className="group">
          <div className="row-between">
            <span className="muted">Bought {shortDate(p.bought_date)}</span>
            <strong>{money(p.bought_price)}</strong>
          </div>
          {p.bought_store && <div className="small muted">at {p.bought_store}</div>}
        </div>
      ) : (
        <div className="price-box">
          <div>
            <span className="muted small">Best price now</span>
            <strong className="big">{money(p.price_now ?? p.saved_price)}</strong>
            {p.best && <span className="small">at {p.best.store}{p.best.delivery ? ` (incl. ${money(p.best.delivery)} delivery)` : ''}</span>}
          </div>
          <dl>
            <dt>When saved</dt>
            <dd>{money(p.saved_price)}</dd>
            <dt>Lowest seen</dt>
            <dd>{money(p.lowest_ever)}</dd>
            <dt>Your target</dt>
            <dd>{p.target_price != null ? money(p.target_price) : '—'}</dd>
          </dl>
          <Badges p={p} />
        </div>
      )}

      {p.latest?.length > 0 && (
        <div className="group">
          <div className="group-head">
            <strong>Shops</strong>
            <span className="muted small">{p.last_checked_at ? `checked ${ago(p.last_checked_at)}` : ''}</span>
          </div>
          <ul className="shops">
            {p.latest.map((r, i) => (
              <li key={r.id} className={r.in_stock === false ? 'oos' : ''}>
                <div className="p-main">
                  <div>
                    {i === 0 && r.in_stock !== false && <span className="crown">Cheapest · </span>}
                    <strong>{r.store}</strong>
                  </div>
                  <div className="p-sub">
                    {r.in_stock === false ? 'Out of stock · ' : ''}
                    {r.delivery ? `+${money(r.delivery)} delivery · ` : ''}
                    {r.note ? `${r.note} · ` : ''}
                    {ago(r.checked_at)}
                  </div>
                </div>
                <div className="p-price">
                  <strong>{money(r.total)}</strong>
                  {r.was_price && <s className="muted small">{money(r.was_price)}</s>}
                </div>
                {r.url && (
                  <a className="icon-btn out" href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.store}`}>
                    <IconOut />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && <p className="small muted">{note}</p>}
      {error && <p className="error">{error}</p>}

      {!isBought && (
        <>
          <a className="primary claude" href={claudeLink(p)} target="_blank" rel="noreferrer">
            Compare prices with Claude
          </a>
          <div className="row">
            <button className="secondary" onClick={recheck} disabled={!!busy}>
              {busy === 'recheck' ? 'Checking…' : 'Re-check link'}
            </button>
            <button className={`secondary ${panel === 'price' ? 'on' : ''}`} onClick={() => setPanel(panel === 'price' ? null : 'price')}>
              Add a price
            </button>
          </div>
        </>
      )}
      {panel === 'price' && (
        <AddPrice
          onSave={(row) =>
            run('price', async () => {
              setP(await api(`/api/products/${id}/prices`, { method: 'POST', body: row }));
              setPanel(null);
              onChanged();
            })
          }
        />
      )}

      <div className="row">
        {!isBought ? (
          <button className={`secondary ${panel === 'buy' ? 'on' : ''}`} onClick={() => setPanel(panel === 'buy' ? null : 'buy')}>
            I bought it
          </button>
        ) : (
          <button className="secondary" onClick={() => patch({ status: 'wishlist', bought_price: null, bought_store: null, bought_date: null })}>
            Back to wishlist
          </button>
        )}
        <button className={`secondary ${panel === 'edit' ? 'on' : ''}`} onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>
          Edit
        </button>
      </div>
      {panel === 'buy' && <BuyForm p={p} busy={busy === 'save'} onSave={(b) => patch({ mark_bought: true, ...b })} />}
      {panel === 'edit' && <EditForm p={p} busy={busy === 'save'} onSave={(b) => patch(b)} />}

      {p.history?.length > 0 && (
        <button className="link" onClick={() => setPanel(panel === 'history' ? null : 'history')}>
          {panel === 'history' ? 'Hide' : 'Show'} price history ({p.history.length})
        </button>
      )}
      {panel === 'history' && (
        <ul className="history">
          {p.history.map((h) => (
            <li key={h.id}>
              <span className="muted small">{ago(h.checked_at)}</span>
              <span className="grow">
                {h.store}
                {h.in_stock === false ? ' (out of stock)' : ''}
                <span className="muted small"> · {h.source}</span>
              </span>
              <strong>{money(h.price)}</strong>
              <button className="icon-btn" aria-label="Remove this price" onClick={() => removePrice(h.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        {!isBought && p.status !== 'dropped' && (
          <button className="danger" onClick={() => patch({ status: 'dropped' }, onClose)}>
            Don't want it
          </button>
        )}
        <button className="danger" onClick={remove}>
          Delete
        </button>
      </div>
    </Sheet>
  );
}

function AddPrice({ onSave }) {
  const [r, setR] = useState({ store: '', price: '', delivery: '', url: '', note: '' });
  const set = (k) => (e) => setR((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="group">
      <div className="row">
        <input placeholder="Shop" value={r.store} onChange={set('store')} />
        <input placeholder="Price £" inputMode="decimal" value={r.price} onChange={set('price')} />
      </div>
      <div className="row">
        <input placeholder="Delivery £ (optional)" inputMode="decimal" value={r.delivery} onChange={set('delivery')} />
        <input placeholder="Note (optional)" value={r.note} onChange={set('note')} />
      </div>
      <input placeholder="Link (optional)" inputMode="url" value={r.url} onChange={set('url')} />
      <button className="primary" disabled={!(r.store || r.url) || !r.price} onClick={() => onSave(r)}>
        Save price
      </button>
    </div>
  );
}

function BuyForm({ p, busy, onSave }) {
  const [b, setB] = useState({
    price: String(p.price_now ?? p.saved_price ?? ''),
    store: p.best?.store || p.store || '',
    date: today(),
  });
  const set = (k) => (e) => setB((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="group">
      <div className="row">
        <label className="field">
          <span>Paid (£)</span>
          <input inputMode="decimal" value={b.price} onChange={set('price')} />
        </label>
        <label className="field">
          <span>Shop</span>
          <input value={b.store} onChange={set('store')} />
        </label>
      </div>
      <label className="field">
        <span>Date</span>
        <input type="date" value={b.date} onChange={set('date')} />
      </label>
      <button className="primary" disabled={busy || !b.price} onClick={() => onSave({ ...b, price: Number(b.price) })}>
        {busy ? 'Saving…' : 'Mark as bought'}
      </button>
      <p className="small muted">Tip: ask Claude to log it in your expense tracker too.</p>
    </div>
  );
}

function EditForm({ p, busy, onSave }) {
  const [e, setE] = useState({
    name: p.name || '',
    variant: p.variant || '',
    target_price: p.target_price != null ? String(p.target_price) : '',
    priority: p.priority || 'normal',
    notes: p.notes || '',
    url: p.url || '',
    image_url: p.image_url || '',
  });
  const set = (k) => (ev) => setE((x) => ({ ...x, [k]: ev.target.value }));
  return (
    <div className="group">
      <label className="field">
        <span>Name</span>
        <input value={e.name} onChange={set('name')} />
      </label>
      <div className="row">
        <label className="field">
          <span>Size / colour</span>
          <input value={e.variant} onChange={set('variant')} />
        </label>
        <label className="field">
          <span>Buy if under (£)</span>
          <input inputMode="decimal" value={e.target_price} onChange={set('target_price')} />
        </label>
      </div>
      <div className="seg">
        {['low', 'normal', 'high'].map((k) => (
          <button key={k} className={e.priority === k ? 'on' : ''} onClick={() => setE((x) => ({ ...x, priority: k }))}>
            {k === 'high' ? 'Need it' : k === 'normal' ? 'Want it' : 'Someday'}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Notes</span>
        <input value={e.notes} onChange={set('notes')} />
      </label>
      <label className="field">
        <span>Link</span>
        <input inputMode="url" value={e.url} onChange={set('url')} />
      </label>
      <label className="field">
        <span>Picture link</span>
        <input inputMode="url" value={e.image_url} onChange={set('image_url')} />
      </label>
      <button className="primary" disabled={busy || !e.name.trim()} onClick={() => onSave(e)}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

function Sheet({ children, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
