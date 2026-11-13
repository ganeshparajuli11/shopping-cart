import { ok, fail } from '@/lib/http';
import { previewUrl } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Reads a shop link so the Add screen can fill in name, picture and price.
export async function POST(req) {
  try {
    const { url } = await req.json();
    return ok(await previewUrl(url));
  } catch (e) {
    return fail(e);
  }
}
