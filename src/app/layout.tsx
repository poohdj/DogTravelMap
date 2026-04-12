import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: '반려견 동반 장소 지도 - 멍스팟',
  description: '강아지와 함께 갈 수 있는 카페, 식당, 산책로를 한눈에! 전국 애견 동반 장소 지도 서비스 멍스팟입니다. 🐾',
  keywords: ['애견동반카페', '반려견동반식당', '애견산책로', '강아지동반여행', '멍스팟', '전국애견지도'],
  authors: [{ name: '멍스팟' }],
  creator: '멍스팟',
  publisher: '멍스팟',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://mungspot.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: '멍스팟 - 반려견 동반 장소 지도',
    description: '강아지와 함께 갈 수 있는 장소를 가장 쉽고 빠르게 찾아보세요.',
    url: 'https://mungspot.com',
    siteName: '멍스팟',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '멍스팟 - 반려견 동반 장소 지도',
    description: '전국 애견 동반 카페, 식당, 명소 정보를 한눈에 확인하세요.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'vfYqxaw1buFycCmBYv-ic65viSS3VA2ymkZjfcFTq-Y',
  },
  other: {
    'naver-site-verification': 'cf6694632f05ff2cb8e391744f63666c7225ea61',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
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
