import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PortfolioPulse',
  description: 'Consolidated stock portfolio tracking with technical analysis signals',
  icons: { icon: 'data:,' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: '#060a13' }}>{children}</body>
    </html>
  );
}