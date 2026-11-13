import { ok, fail } from '@/lib/http';
import { recheckSaved, getProduct } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(_req, { params }) {
  try {
    const { id } = await params;
    const [result] = await recheckSaved([Number(id)]);
    return ok({ result, product: await getProduct(id) });
  } catch (e) {
    return fail(e);
  }
}
