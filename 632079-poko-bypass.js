/**
 * 632079.xyz 个人服务直连 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 为 *.poko.632079.xyz 与 *.node.632079.xyz 添加 DIRECT 规则，
 * 置于所有规则之前（最高优先级），保证这两个子域始终直连、不走代理。
 *
 * DOMAIN-SUFFIX 匹配包含域自身及其全部子域（Mihomo 语义）。
 *
 * 幂等：重复执行不会产生重复规则。
 */

/** 需要直连的域（DOMAIN-SUFFIX 同时覆盖域自身与子域） */
const BYPASS_DOMAINS = ["poko.632079.xyz", "node.632079.xyz"];

/**
 * @param {Record<string, any>} config 完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const rules = Array.isArray(config["rules"]) ? config["rules"] : [];
  const directRules = BYPASS_DOMAINS.map((d) => `DOMAIN-SUFFIX,${d},DIRECT`);

  // 去重：移除可能已存在的同名规则后整体前置，保持幂等
  const deduped = rules.filter((r) => !directRules.includes(r));

  config["rules"] = [...directRules, ...deduped];
  return config;
}

// 全局入口（与 convert.js 一致的覆写脚本约定）
if (typeof globalThis !== "undefined") {
  // eslint-disable-next-line no-undef
  globalThis.main = main;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = main;
  module.exports.main = main;
}
