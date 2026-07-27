import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Talk Guide — 在喜欢的语境里学会韩语",
    description: "为初级追星用户设计的韩语单词学习与间隔复习工具。",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Talk Guide — 在喜欢的语境里学会韩语",
      description: "多轮首次学习、间隔复习与真实追星语境。",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "Talk Guide 韩语学习" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Talk Guide — 在喜欢的语境里学会韩语",
      description: "多轮首次学习、间隔复习与真实追星语境。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
