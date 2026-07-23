import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/react';
import "./globals.css";

export const metadata: Metadata = {
  title: "BranchDeck — AI Codebase Understanding & Visualization Tool",
  description: "AI-powered codebase intelligence that transforms complex software into interactive maps, call flows, and human-readable documentation. Optimize developer onboarding, legacy code navigation, and dependency graphing.",
  keywords: [
    "AI codebase understanding",
    "codebase visualization",
    "dependency graph",
    "onboarding developers",
    "understand legacy code",
    "architecture visualization",
    "software dependency map",
    "VS Code extension",
    "code navigation",
    "code documentation automation"
  ],
  alternates: {
    canonical: "https://branchdeck.com"
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: "BranchDeck — AI Codebase Understanding & Visualization Tool",
    description: "AI-powered codebase intelligence for modern engineering teams. Understand architecture, trace dependencies, and onboard developers faster.",
    url: "https://branchdeck.com",
    type: "website",
    images: [{ url: '/logo.png' }]
  },
  twitter: {
    card: "summary_large_image",
    title: "BranchDeck — AI Codebase Intelligence",
    description: "Understand any codebase instantly.",
    images: ['/logo.png']
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "BranchDeck",
    "operatingSystem": "Windows, macOS, Linux",
    "applicationCategory": "DeveloperApplication",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": "AI-powered codebase intelligence that transforms complex software into interactive maps, call flows, and human-readable documentation."
  };

  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,slnt,wdth,wght,ROND@8..144,-10..0,25..150,400..700,0..100&family=Google+Sans+Code:ital,wght@0,300..700;1,300..700&family=Google+Symbols:opsz,wght,FILL,GRAD,ROND@40..48,300,0..1,0,50&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
