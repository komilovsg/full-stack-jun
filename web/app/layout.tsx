import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARD - AI Report Digest',
  description: 'Интеллектуальный ассистент для анализа групповых чатов Telegram',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

