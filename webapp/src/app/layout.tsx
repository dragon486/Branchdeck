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
  openGraph: {
    title: "BranchDeck — AI Codebase Understanding & Visualization Tool",
    description: "AI-powered codebase intelligence for modern engineering teams. Understand architecture, trace dependencies, and onboard developers faster.",
    url: "https://branchdeck.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BranchDeck — AI Codebase Intelligence",
    description: "Understand any codebase instantly.",
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
