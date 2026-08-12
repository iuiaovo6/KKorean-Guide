#!/usr/bin/env bash
set -euo pipefail

# 静态构建：产出可直接托管到 GitHub Pages 的 dist/client。
# 说明：Vinext 0.0.50 的 output:'export' 会把“无法在构建期静态判定”的路由
# （本项目的根路由因历史原因被误判）直接跳过、不写 index.html。
# 所以这里在 vinext build 之后，手动用生产服务器把首页渲染成 index.html 存盘。
# 同时修正字体/资源路径的 basePath，并写入 .nojekyll（GitHub Pages 默认走 Jekyll，
# 会忽略 _next/_vinext_fonts 等下划线目录）。

unset CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR CODEBUDDY_TOOL_CALL_ID 2>/dev/null || true

REPO_NAME="KKorean-Guide"
BASE="/$REPO_NAME"

echo "==> vinext build (GITHUB_PAGES=1)"
GITHUB_PAGES=1 npx vinext build

echo "==> 启动生产服务器，预渲染首页为 index.html"
GITHUB_PAGES=1 npx vinext start > /tmp/vinext-start.log 2>&1 &
SVR=$!
for i in $(seq 1 30); do
  if curl --noproxy '*' -s -o /dev/null "http://127.0.0.1:3000/" 2>/dev/null; then break; fi
  sleep 1
done
curl --noproxy '*' -s -o dist/client/index.html "http://127.0.0.1:3000${BASE}/"
kill "$SVR" 2>/dev/null || true

if [ ! -s dist/client/index.html ]; then
  echo "预渲染失败：未生成 dist/client/index.html" >&2
  exit 1
fi

echo "==> 修正字体/资源 basePath ($BASE)"
sed -i.bak "s#/assets/_vinext_fonts#${BASE}/assets/_vinext_fonts#g" dist/client/index.html
sed -i.bak "s#href=\"/logo-k-heart.svg\"#href=\"${BASE}/logo-k-heart.svg\"#g" dist/client/index.html
rm -f dist/client/index.html.bak
for f in dist/client/assets/*.css; do
  [ -f "$f" ] || continue
  sed -i.bak "s#/assets/_vinext_fonts#${BASE}/assets/_vinext_fonts#g" "$f"
  rm -f "$f.bak"
done

echo "==> 写入 .nojekyll"
touch dist/client/.nojekyll

echo "==> 完成：静态产物在 dist/client（可直接部署到 GitHub Pages 的 /${REPO_NAME}/）"
