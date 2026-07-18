import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StorePilot",
  description: "An AI store manager for small retailers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
