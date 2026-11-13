import { ok, fail } from '@/lib/http';
import { listProducts, addProduct, getStats } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req) {
  try {
    const p = Object.fromEntries(req.nextUrl.searchParams);
    if (p.deals_only) p.deals_only = p.deals_only === '1' || p.deals_only === 'true';
    const [products, stats] = await Promise.all([listProducts(p), getStats()]);
    return ok({ products, stats });
  } catch (e) {
    return fail(e, 500);
  }
}

export async function POST(req) {
  try {
    const res = await addProduct(await req.json(), { source: 'app' });
    return ok(res, res.duplicate ? 200 : 201);
  } catch (e) {
    return fail(e);
  }
}
