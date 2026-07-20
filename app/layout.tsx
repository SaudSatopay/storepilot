import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const ui = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

const data = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-data",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "StorePilot, the AI store manager",
    template: "%s | StorePilot",
  },
  description:
    "StorePilot reads your sales and inventory every morning, tells you the three things that need doing today, then drafts the messages that do them.",
  keywords: [
    "AI store manager",
    "small retail",
    "inventory forecasting",
    "morning brief",
    "GPT-5.6",
  ],
  openGraph: {
    title: "StorePilot, the AI store manager",
    description:
      "A morning brief for your store: anomalies, stockout forecasts, and one-tap supplier reorders, grounded in your real sales data.",
    url: appUrl,
    siteName: "StorePilot",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${ui.variable} ${data.variable}`}>
        {children}
      </body>
    </html>
  );
}
