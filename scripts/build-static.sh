#!/usr/bin/env bash
set -euo pipefail

# 静态构建：产出可直接托管到 GitHub Pages 的 dist/client。
# 说明：Vinext 0.0.50 的 output:'export' 会把“无法在构建期静态判定”的路由
# （本项目的根路由因历史原因被误判）直接跳过、不写 index.html。
# 所以这里在 vinext build 之后，手动用生产服务器把首页渲染成 index.html 存盘。
# 同时修正字体/资源路径的 basePath，并写入 .nojekyll（GitHub Pages 默认走 Jekyll，
# 会忽略 _next/_vinext_fonts 等下划线目录）。

unset CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR CODEBUDDY_TOOL_CALL_ID 2>/dev/null || true

# 静态站点不依赖 Supabase（公开浏览走 words.json；登录在大陆本就不可用）。
# 但 lib/supabase.ts 在缺少环境变量时会 throw，导致 vinext start 渲染首页返回 500，
# 被脚本原样存成 index.html（曾经因此部署出 21 字节的 “Internal Server Error”）。
# 这里注入占位值，仅为让 supabase 客户端成功初始化；静态站不会真正调用 Supabase。
# 若环境本身已提供真实值，则 ${VAR:-占位} 会保留真实值，不影响本地/Cloudflare 构建。
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-public-placeholder-key}"

# 静态托管在 GitHub Pages 子路径 /KKorean-Guide 下；该前缀会打进客户端包，
# 供 layout.tsx（图标/OG 图）与 page.tsx（品牌 <img>）拼出正确的资源路径。
export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/KKorean-Guide}"

REPO_NAME="KKorean-Guide"
BASE="/$REPO_NAME"

echo "==> vinext build (GITHUB_PAGES=1)"
GITHUB_PAGES=1 npx vinext build

echo "==> 启动生产服务器，预渲染首页为 index.html"
GITHUB_PAGES=1 npx vinext start > /tmp/vinext-start.log 2>&1 &
SVR=$!
# 等待【目标路由】/KKorean-Guide/ 返回 200（而非仅根路径）。CI 环境可能更慢，给 60s。
for i in $(seq 1 60); do
  if curl --noproxy '*' -s -f -o /dev/null "http://127.0.0.1:3000${BASE}/" 2>/dev/null; then break; fi
  sleep 1
done
# 抓取首页并校验 HTTP 状态码；任何非 200 都视为失败，绝不静默部署坏页面。
code=$(curl --noproxy '*' -s -o dist/client/index.html -w "%{http_code}" "http://127.0.0.1:3000${BASE}/" || echo 000)
kill "$SVR" 2>/dev/null || true

if [ "$code" != "200" ] || [ ! -s dist/client/index.html ]; then
  echo "预渲染失败：HTTP $code（期望 200）" >&2
  echo "--- vinext start 日志 ---" >&2
  tail -30 /tmp/vinext-start.log >&2
  exit 1
fi

echo "==> 修正字体/资源 basePath ($BASE)"
sed -i.bak "s#/assets/_vinext_fonts#${BASE}/assets/_vinext_fonts#g" dist/client/index.html
sed -i.bak "s#href=\"/korean-guide-icon.png\"#href=\"${BASE}/korean-guide-icon.png\"#g" dist/client/index.html
sed -i.bak "s#href=\"/apple-touch-icon.png\"#href=\"${BASE}/apple-touch-icon.png\"#g" dist/client/index.html
sed -i.bak "s#href=\"/site.webmanifest\"#href=\"${BASE}/site.webmanifest\"#g" dist/client/index.html
rm -f dist/client/index.html.bak
for f in dist/client/assets/*.css; do
  [ -f "$f" ] || continue
  sed -i.bak "s#/assets/_vinext_fonts#${BASE}/assets/_vinext_fonts#g" "$f"
  rm -f "$f.bak"
done

echo "==> 写入 .nojekyll"
touch dist/client/.nojekyll

echo "==> 完成：静态产物在 dist/client（可直接部署到 GitHub Pages 的 /${REPO_NAME}/）"
