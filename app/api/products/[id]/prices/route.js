import { ok, fail } from '@/lib/http';
import { recordPrices, deletePrice, getProduct } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Add a price by hand (e.g. you saw it cheaper in a shop).
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const res = await recordPrices(id, Array.isArray(body) ? body : [body], { source: 'app' });
    if (!res.saved) return fail(new Error(res.skipped[0]?.reason || 'Nothing saved'));
    return ok(res.product, 201);
  } catch (e) {
    return fail(e);
  }
}

// ?price_id=123 removes one wrong price entry.
export async function DELETE(req, { params }) {
  const { id } = await params;
  const priceId = req.nextUrl.searchParams.get('price_id');
  if (!priceId) return fail(new Error('price_id is required'));
  await deletePrice(priceId);
  return ok(await getProduct(id));
}
