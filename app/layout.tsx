import type { Metadata } from "next";
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

// 静态导出（GitHub Pages）时使用固定 origin；本地预览用 localhost。
const siteOrigin =
  process.env.GITHUB_PAGES === "1"
    ? "https://iuiaovo6.github.io/KKorean-Guide"
    : "http://localhost:3000";

// 站点托管在 GitHub Pages 的子路径 /KKorean-Guide 下，所有公开静态资源
// （图标、OG 图）必须带该前缀，否则浏览器会解析到源站根路径而 404。
// NEXT_PUBLIC_ 前缀保证该值会被打进客户端包（page.tsx 的 <img> 也用得到）。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteOrigin),
    title: "Korean Guide — 在喜欢的语境里学会韩语",
    description: "为初级追星用户设计的韩语单词学习与间隔复习工具。",
    icons: {
      icon: `${basePath}/logo-k-heart.svg`,
      shortcut: `${basePath}/logo-k-heart.svg`,
      apple: `${basePath}/apple-touch-icon.png`,
    },
    openGraph: {
      title: "Korean Guide — 在喜欢的语境里学会韩语",
      description: "多轮首次学习、间隔复习与真实追星语境。",
      images: [{ url: `${basePath}/og.png`, width: 1200, height: 630, alt: "Korean Guide 韩语学习" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Korean Guide — 在喜欢的语境里学会韩语",
      description: "多轮首次学习、间隔复习与真实追星语境。",
      images: [`${basePath}/og.png`],
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
