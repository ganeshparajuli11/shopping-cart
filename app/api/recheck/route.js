import { ok, fail } from '@/lib/http';
import { recheckSaved } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Re-reads the saved link of every wishlist item and records today's price.
export async function POST() {
  try {
    return ok({ results: await recheckSaved() });
  } catch (e) {
    return fail(e, 500);
  }
}
