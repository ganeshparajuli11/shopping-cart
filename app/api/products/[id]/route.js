import { ok, fail } from '@/lib/http';
import { getProduct, updateProduct, deleteProduct, markBought } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const { id } = await params;
  const p = await getProduct(id);
  return p ? ok(p) : fail(new Error('Not found'), 404);
}

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (body.mark_bought) {
      const { price, store, date } = body;
      return ok(await markBought(id, { price, store, date }));
    }
    return ok(await updateProduct(id, body));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  return (await deleteProduct(id)) ? ok({ deleted: true }) : fail(new Error('Not found'), 404);
}
