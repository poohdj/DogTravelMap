import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: '반려견 동반 장소 지도 - 멍스팟',
  description: '강아지와 함께 갈 수 있는 카페, 산책로 등을 찾아보세요.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {/* Map script is now dynamically loaded in page.tsx to prevent loading race conditions */}
        {children}
      </body>
    </html>
  );
}
