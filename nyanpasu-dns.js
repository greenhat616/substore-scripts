/**
 * DNS proxy-server-nameserver 去重 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 改写自 Clash Nyanpasu 官方 JavaScript 模板（https://nyanpasu.org/），
 * 在其基础上修复「重复执行会反复 prepend 'system'」的问题。
 *
 * 原始模板：
 *   profile.dns['proxy-server-nameserver'] = [
 *     'system',
 *     ...profile.dns['proxy-server-nameserver']
 *   ]
 * 若配置中已含 'system'（或脚本被链式/重复执行），会产生重复项。
 *
 * 本脚本行为：
 *   1. 保证 'system' 位于 dns['proxy-server-nameserver'] 首位
 *      （解析代理服务器域名时优先使用系统 DNS，避免回环）。
 *   2. 对数组整体去重（保序，空字符串/非字符串项剔除）。
 *   3. dns 或该字段缺失 / 非数组时不做任何改动（与原始模板一致）。
 *
 * 幂等：重复执行结果不变。
 */

/**
 * @param {Record<string, any>} config 完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const dns = config.dns;
  if (!dns || typeof dns !== "object") return config;

  const key = "proxy-server-nameserver";
  if (!Array.isArray(dns[key])) return config;

  // 'system' 提前到首位 + 整体保序去重
  const deduped = [];
  for (const item of ["system", ...dns[key]]) {
    if (typeof item === "string" && item !== "" && !deduped.includes(item)) {
      deduped.push(item);
    }
  }
  dns[key] = deduped;

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
