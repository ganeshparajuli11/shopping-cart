import './globals.css';

export const metadata = {
  title: 'Wishlist',
  description: 'Products I want, with the best price across shops',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Wishlist', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f1115',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
