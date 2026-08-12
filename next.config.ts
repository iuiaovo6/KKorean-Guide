import type { NextConfig } from "next";

// 部署到 GitHub Pages 项目页（iuiaovo6.github.io/KKorean-Guide）时置 GITHUB_PAGES=1，
// 让资源路径带 /KKorean-Guide 前缀；本地预览或不走 Pages 时留空。
const isGithubPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: isGithubPages ? "/KKorean-Guide" : "",
  trailingSlash: true,
};

export default nextConfig;
