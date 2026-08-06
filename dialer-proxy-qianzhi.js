/**
 * 前置代理 dialer-proxy 注入 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 配合 powerfullz/override-rules 的 convert.js 使用，作为链式覆写脚本之一
 * （Clash Verge Rev / Mihomo Party / Sparkle 均支持脚本链式执行）。
 *
 * 入参 config 为完整 Mihomo 配置对象，本脚本遍历 config.proxies：
 *   若节点协议为 socks5 / http，或名称命中疑似家宽/落地节点关键词，
 *   满足其一即为其添加 `dialer-proxy: 前置代理`，使该节点经「前置代理」分组中转。
 *
 * 幂等：重复执行只是重复赋同样的值，不会产生副作用。
 */

/** dialer-proxy 指向的分组/节点名称 */
const DIALER_PROXY = "前置代理";

/** 命中以下协议的节点直接注入 dialer-proxy（家宽/落地节点常见协议） */
const TARGET_TYPES = ["socks5", "http"];

/** 疑似家宽/落地节点的名称关键词（不区分大小写） */
const SUSPECT_NAME_REGEX = /家宽|住宅|原生|落地/i;

/**
 * 判断节点是否需要注入 dialer-proxy：
 * 协议为 socks5 / http，或名称命中疑似家宽/落地节点关键词，满足其一即可。
 *
 * @param {Record<string, any>} proxy
 * @returns {boolean}
 */
function isSuspectLandingProxy(proxy) {
  if (!proxy || typeof proxy !== "object") return false;

  const type = typeof proxy.type === "string" ? proxy.type.toLowerCase() : "";
  if (TARGET_TYPES.includes(type)) return true;

  const name = typeof proxy.name === "string" ? proxy.name : "";
  return SUSPECT_NAME_REGEX.test(name);
}

/**
 * @param {Record<string, any>} config 完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const proxies = Array.isArray(config.proxies) ? config.proxies : [];
  proxies.forEach((proxy) => {
    if (isSuspectLandingProxy(proxy)) {
      proxy["dialer-proxy"] = DIALER_PROXY;
    }
  });

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
