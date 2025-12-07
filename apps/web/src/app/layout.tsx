import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SocketProvider from '@/components/SocketProvider';
import { AuthProvider } from '@/components/AuthProvider';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEURON - Image to Code AI',
  description: 'Transform images into production-ready code with AI. Upload any design and get clean React, HTML, and CSS instantly.',
  keywords: ['AI', 'image to code', 'design to code', 'React', 'HTML', 'CSS', 'Tailwind'],
  authors: [{ name: 'NEURON' }],
  icons: {
    icon: '/icon',
    apple: '/apple-icon',
  },
  openGraph: {
    title: 'NEURON - Image to Code AI',
    description: 'Transform images into production-ready code with AI',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Geometric Pattern Background */}
        <div className="geometric-bg" aria-hidden="true" />
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
