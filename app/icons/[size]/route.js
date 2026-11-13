import { ImageResponse } from 'next/og';

// App icons generated on the fly (/icons/180, /icons/192, /icons/512).
export async function GET(_req, { params }) {
  const { size: raw } = await params;
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 192;
  const s = Math.round(size * 0.56);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #ff9a3d, #ff4f8b)',
        }}
      >
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
          <path d="M9 10V7a3 3 0 0 1 6 0v3" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=604800, immutable' } }
  );
}
