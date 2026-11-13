// Minimal MCP server (Streamable HTTP, JSON responses) for the Claude connector.
import {
  addProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  recordPrices,
  recheckSaved,
  markBought,
  deletePrice,
  getStats,
  todayLondon,
} from './data.js';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `This is Ganesh's shopping wishlist. He lives in the UK (Birmingham), pays in GBP (£) and is a university student.
He saves products he wants and buys them when he has money or when a deal appears.

ADDING: when he shares a product link (or a screenshot of a product), call add_product with the link. The server reads the page;
if it can't (shop blocked it), fill in name, brand, model_code, price and image_url yourself from what you can see or fetch.
Ask for size/colour only if it matters (clothes, shoes) and he hasn't said; put it in "variant".

PRICE COMPARISON ("check prices", "is it cheaper anywhere?", "should I buy it now?"):
1. get_product to see what is saved (exact product, model_code, variant, past prices).
2. Search the web for the SAME item (match the model/style code, e.g. Skechers 77156EC, and colour) at UK shops that deliver to the UK:
   the brand's own site, Amazon UK, eBay UK (new only, say if it is a marketplace seller), Argos, Very, John Lewis, Next, JD Sports,
   Sports Direct, Schuh, Office, Zalando, ASOS, TK Maxx, Currys, etc. Use price comparison sites (idealo, PriceSpy, Google Shopping)
   and hotukdeals to find shops and live voucher codes. Check student discounts (UNiDAYS, Student Beans, TOTUM) for each shop.
3. Only count listings where the size/variant he wants is in stock. Include delivery cost if there is one (free over £X counts as free only if he'd reach it).
4. Call record_prices ONCE with every shop you checked (store, url, price, was_price, delivery, in_stock, note for codes like "STUDENT15 = -15%"),
   including the saved shop's current price. Prices go in as the final price before any voucher; put voucher maths in the note.
5. Reply with a short table sorted cheapest first (shop, price, delivery, total, note) and a clear one-line verdict:
   buy now / wait (and why: e.g. Black Friday is close, price was lower before) — he decides.
Never buy anything or enter payment details. When he says he bought it, call mark_bought with the price and shop.
If his "expense" connector is also on, offer to log the purchase there as a Shopping expense.`;

const priceRow = {
  type: 'object',
  properties: {
    store: { type: 'string', description: 'Shop name, e.g. "Amazon", "Skechers", "JD Sports"' },
    url: { type: 'string', description: 'Link to the listing' },
    price: { type: 'number', description: 'Current selling price in GBP' },
    was_price: { type: 'number', description: 'Crossed-out / RRP price if shown' },
    delivery: { type: 'number', description: 'Delivery cost in GBP (0 if free)' },
    in_stock: { type: 'boolean', description: 'false if the wanted size/variant is out of stock' },
    note: { type: 'string', description: 'e.g. "UNiDAYS 10% off → £45", "marketplace seller", "free delivery over £50"' },
  },
  required: ['price'],
};

const productProps = {
  url: { type: 'string', description: 'Product page link' },
  name: { type: 'string' },
  brand: { type: 'string' },
  model_code: { type: 'string', description: 'Style / model / SKU code used to find the same item elsewhere' },
  variant: { type: 'string', description: 'Size, colour, storage etc. e.g. "UK 9, Black"' },
  image_url: { type: 'string' },
  store: { type: 'string' },
  target_price: { type: 'number', description: 'Price he would happily buy at' },
  priority: { type: 'string', enum: ['low', 'normal', 'high'] },
  notes: { type: 'string' },
};

export const TOOLS = [
  {
    name: 'add_product',
    description:
      'Save a product to the wishlist from its link. Missing details are read from the page automatically. If the link is already saved, the existing product is returned.',
    inputSchema: {
      type: 'object',
      properties: { ...productProps, price: { type: 'number', description: 'Price at this link now, if known' }, was_price: { type: 'number' }, in_stock: { type: 'boolean' } },
      required: ['url'],
    },
    annotations: { title: 'Add product', readOnlyHint: false, destructiveHint: false },
    run: async (a) => ({ today: todayLondon(), ...(await addProduct(a, { source: 'claude' })) }),
  },
  {
    name: 'list_products',
    description: 'List saved products with their best current price, saved price and whether it is a deal. status: wishlist (default), bought, dropped or all.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['wishlist', 'bought', 'dropped', 'all'] },
        search: { type: 'string' },
        deals_only: { type: 'boolean', description: 'Only items now cheaper than when saved or at/below target' },
      },
    },
    annotations: { title: 'List products', readOnlyHint: true },
    run: async (a) => ({ today: todayLondon(), stats: await getStats(), products: await listProducts(a) }),
  },
  {
    name: 'get_product',
    description: 'One product with the latest price at every shop checked and the full price history.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    annotations: { title: 'Get product', readOnlyHint: true },
    run: async ({ id }) => {
      const p = await getProduct(id);
      if (!p) throw new Error(`Product ${id} not found`);
      return { today: todayLondon(), product: p };
    },
  },
  {
    name: 'record_prices',
    description: 'Save the prices found at different shops for a product (after comparing). Adds to the history; the app shows the cheapest in-stock shop.',
    inputSchema: {
      type: 'object',
      properties: { product_id: { type: 'number' }, prices: { type: 'array', items: priceRow } },
      required: ['product_id', 'prices'],
    },
    annotations: { title: 'Record prices', readOnlyHint: false, destructiveHint: false },
    run: async ({ product_id, prices }) => recordPrices(product_id, prices, { source: 'claude' }),
  },
  {
    name: 'recheck_saved_links',
    description: 'Quickly re-read the saved link of each product (or the given ids) and record the price shown now. Some shops block this; then search the web instead.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'number' } } } },
    annotations: { title: 'Re-check saved links', readOnlyHint: false, destructiveHint: false },
    run: async ({ ids }) => ({ today: todayLondon(), results: await recheckSaved(ids) }),
  },
  {
    name: 'update_product',
    description: 'Change details: name, variant (size/colour), target price, priority, notes, link, or status (wishlist / bought / dropped).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        ...productProps,
        status: { type: 'string', enum: ['wishlist', 'bought', 'dropped'] },
      },
      required: ['id'],
    },
    annotations: { title: 'Update product', readOnlyHint: false, destructiveHint: false },
    run: async ({ id, ...fields }) => ({ product: await updateProduct(id, fields) }),
  },
  {
    name: 'mark_bought',
    description: 'Mark a product as bought, with the price paid and the shop. Defaults to the best price found.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        price: { type: 'number', description: 'Total paid in GBP' },
        store: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, default today' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: { title: 'Mark bought', readOnlyHint: false, destructiveHint: false },
    run: async ({ id, ...rest }) => ({ product: await markBought(id, rest) }),
  },
  {
    name: 'delete_product',
    description: 'Delete a product and its price history.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    annotations: { title: 'Delete product', readOnlyHint: false, destructiveHint: true },
    run: async ({ id }) => ({ deleted: await deleteProduct(id), id }),
  },
  {
    name: 'delete_price',
    description: 'Remove one wrong price entry (by its id from get_product history).',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
    annotations: { title: 'Delete price', readOnlyHint: false, destructiveHint: true },
    run: async ({ id }) => ({ deleted: await deletePrice(id), id }),
  },
];

const publicTools = TOOLS.map(({ run, ...t }) => t);

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id ?? null, -32600, 'Invalid Request');
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const v = SUPPORTED_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED_VERSIONS[1];
      return rpcResult(id, {
        protocolVersion: v,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wishlist', title: 'Shopping Wishlist', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: publicTools });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const out = await tool.run(params.arguments || {});
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return rpcResult(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** Handles a POST body (single message or batch). Returns null when there is nothing to send back. */
export async function handleBody(body) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
    return out.length ? out : null;
  }
  return handleMessage(body);
}
