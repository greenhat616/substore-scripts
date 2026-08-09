"use strict";

/**
 * 将 icons/*.svg 原始素材渲染为 PNG（代理组图标，256px 宽，适配高分屏）。
 * 运行：node ./scripts/render-icons.js   （或 pnpm run build:icons）
 */

const fs = require("node:fs");
const path = require("node:path");
const { Resvg } = require("@resvg/resvg-js");

const ICONS_DIR = path.join(__dirname, "..", "icons");
/** 输出 PNG 宽度（px），高度按 SVG 纵横比缩放；512px 保证高分屏/放大查看时清晰 */
const TARGET_WIDTH = 512;

const svgs = fs.readdirSync(ICONS_DIR).filter((f) => f.endsWith(".svg"));
if (svgs.length === 0) {
  console.log("icons/ 下没有 SVG 素材");
  process.exit(0);
}

for (const file of svgs) {
  const svgPath = path.join(ICONS_DIR, file);
  const pngPath = svgPath.replace(/\.svg$/i, ".png");
  const resvg = new Resvg(fs.readFileSync(svgPath), {
    fitTo: { mode: "width", value: TARGET_WIDTH },
    // 透明背景：不写 background 字段，保留 SVG 原有透明通道
  });
  fs.writeFileSync(pngPath, resvg.render().asPng());
  console.log(`✓ ${file} → ${path.basename(pngPath)}`);
}
