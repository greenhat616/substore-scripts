/**
 * Tailscale 独立分组 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 配合 powerfullz/override-rules 的 convert.js 使用，作为「第二个」覆写脚本
 * 在其之后执行（Clash Verge Rev / Mihomo Party / Sparkle 均支持脚本链式执行）。
 *
 * 入参 config 为 convert.js 已经生成的完整配置对象，本脚本在其基础上：
 *   1. 新增「Tailscale」proxy group（type: select），默认选中 DIRECT。
 *      Tailscale 是 mesh VPN，其控制面 / DERP 流量经代理转发会形成回环，
 *      因此默认直连；用户可手动切换为任意代理分组。
 *   2. 新增 tailscale 路由规则（GEOSITE，与原始脚本风格一致），置于
 *      `GEOSITE,cn` 规则之前（找不到则置于最终 MATCH 之前）。
 *   3. Nyanpasu 兼容：convert.js 生成的 GLOBAL 分组 proxies 为固定列表
 *      （不含后处理新增分组），需将「Tailscale」挂载进 GLOBAL 分组的
 *      proxies，否则 Nyanpasu 在 GLOBAL 模式下无法选中该分组。
 *      见 https://github.com/libnyanpasu/clash-nyanpasu/issues/5112
 *
 * geosite 分类来源：v2fly/domain-list-community 仓库 data/tailscale
 *   https://github.com/v2fly/domain-list-community/blob/master/data/tailscale
 *   （tailscale.com / tailscale.io / ts.net）
 *
 * 幂等：重复执行不会产生重复的分组或规则。
 */

/** 新分组名称 */
const TAILSCALE_GROUP = "Tailscale";
/** convert.js 中 PROXY_GROUPS.SELECT（用于继承动态生成的地区节点候选项） */
const PROXY_GROUPS_SELECT = "选择代理";
/** convert.js 中 PROXY_GROUPS.MANUAL（仅在缺失「选择代理」分组时作兜底候选） */
const PROXY_GROUPS_MANUAL = "手动选择";
/** convert.js 中 PROXY_GROUPS.SSH（分组插入位置的优先锚点） */
const SSH_GROUP = "SSH";
/** convert.js 中 PROXY_GROUPS.FINAL（分组插入位置的兜底锚点） */
const FINAL_GROUP = "Final";
/** convert.js 中 PROXY_GROUPS.GLOBAL（Nyanpasu 兼容需挂载的分组） */
const GLOBAL_GROUP = "GLOBAL";

/**
 * Tailscale 分组专属图标 —— Tailscale 官方 Logomark（PNG）。
 * Koolson/Qure、Orz-3/mini 等主流图标集均无 Tailscale 图标，
 * 故爬取官方资源（https://tailscale.com/favicon.svg）存至本仓库 icons/ 目录并渲染
 * 为 PNG（SVG 为原始素材，见 icons/tailscale.svg）；可自行替换为其它图标集链接。
 */
const TAILSCALE_ICON =
  "https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/icons/tailscale.png";

/**
 * @param {Record<string, any>} config convert.js 生成的完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const rules = Array.isArray(config["rules"]) ? config["rules"] : [];

  // ── 1. 新增 Tailscale 分组 ──────────────────────────────────────────────
  // 复用「选择代理」分组的候选项（convert.js 动态生成的地区节点分组），
  // 这些分组名不能写死，必须从实际配置读取。
  const selectGroup = groups.find((g) => g && g.name === PROXY_GROUPS_SELECT);
  const baseProxies =
    selectGroup && Array.isArray(selectGroup.proxies)
      ? selectGroup.proxies.slice()
      : [PROXY_GROUPS_SELECT, PROXY_GROUPS_MANUAL];

  // 把 DIRECT 放首位 → select 默认选中首项，实现「默认直连」。
  const tsProxies = [
    "DIRECT",
    ...baseProxies.filter((p) => p !== "DIRECT" && p !== TAILSCALE_GROUP),
  ];

  if (!groups.some((g) => g && g.name === TAILSCALE_GROUP)) {
    const tsGroup = {
      name: TAILSCALE_GROUP,
      type: "select",
      icon: TAILSCALE_ICON,
      proxies: tsProxies, // select 类型默认选中数组首项 → DIRECT
    };

    // 插入位置逐级回退：「SSH」之前 → 「Final」之前 → 末尾。
    const sshIndex = groups.findIndex((g) => g && g.name === SSH_GROUP);
    if (sshIndex >= 0) groups.splice(sshIndex, 0, tsGroup);
    else {
      const finalIndex = groups.findIndex((g) => g && g.name === FINAL_GROUP);
      if (finalIndex >= 0) groups.splice(finalIndex, 0, tsGroup);
      else groups.push(tsGroup);
    }
  }

  // ── 2. Nyanpasu 兼容：把 Tailscale 挂载进 GLOBAL 分组的 proxies ─────────
  // convert.js 的 GLOBAL 分组 proxies 为生成时的固定快照，不含后处理新增分组；
  // 其虽有 include-all，但 Nyanpasu 在 GLOBAL 模式下只展示/允许选择 proxies
  // 列表内的项，故需显式挂载（幂等）。
  const globalGroup = groups.find((g) => g && g.name === GLOBAL_GROUP);
  if (globalGroup && Array.isArray(globalGroup.proxies)) {
    if (!globalGroup.proxies.includes(TAILSCALE_GROUP)) {
      // 插在 GLOBAL 列表首位，与「新分组在前」的展示习惯一致。
      globalGroup.proxies.unshift(TAILSCALE_GROUP);
    }
  }

  // ── 3. 新增 tailscale 分流规则 ──────────────────────────────────────────
  // 仅用 GEOSITE（与原始脚本一致），依赖客户端 geosite.dat 的 tailscale 分类。
  const tsRule = `GEOSITE,tailscale,${TAILSCALE_GROUP}`;

  // 去重：移除可能已存在的同名规则后再插入。
  const deduped = rules.filter((r) => r !== tsRule);

  // 插到 GEOSITE,cn 之前；找不到则置于最终 MATCH 之前；均无则前置。
  const cnRuleIndex = deduped.findIndex(
    (r) => typeof r === "string" && r.startsWith("GEOSITE,cn,")
  );
  if (cnRuleIndex >= 0) deduped.splice(cnRuleIndex, 0, tsRule);
  else {
    const matchIndex = deduped.findIndex(
      (r) => typeof r === "string" && r.startsWith("MATCH,")
    );
    if (matchIndex >= 0) deduped.splice(matchIndex, 0, tsRule);
    else deduped.unshift(tsRule);
  }

  config["proxy-groups"] = groups;
  config["rules"] = deduped;
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
