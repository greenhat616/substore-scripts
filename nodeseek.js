/**
 * NodeSeek 独立分组 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 配合 powerfullz/override-rules 的 convert.js 使用，作为「第二个」覆写脚本
 * 在其之后执行（Clash Verge Rev / Mihomo Party / Sparkle 均支持脚本链式执行）。
 *
 * 入参 config 为 convert.js 已经生成的完整配置对象，本脚本在其基础上：
 *   1. 新增「NodeSeek」proxy group（type: select），默认选中「选择代理」。
 *      覆盖 NodeSeek 主站及其衍生服务（NodeImage / NodeGet / NodeQuality /
 *      DeepFlood 等）。上游 convert.js 无 NodeSeek 专属规则，这些流量原本由
 *      GFWList 兜底到「选择代理」，故默认行为与拆分前一致。
 *   2. 新增 rule-provider「nodeseek」（classical yaml，域名列表）与
 *      `RULE-SET,nodeseek` 路由规则，置于 `RULE-SET,GFWList` 规则之前，
 *      使 NodeSeek 流量优先命中独立分组。
 *   3. Nyanpasu 兼容：convert.js 生成的 GLOBAL 分组 proxies 为固定列表
 *      （不含后处理新增分组），需将「NodeSeek」挂载进 GLOBAL 分组的
 *      proxies，否则 Nyanpasu 在 GLOBAL 模式下无法选中该分组。
 *      见 https://github.com/libnyanpasu/clash-nyanpasu/issues/5112
 *
 * ruleset 来源（域名集合：nodeseek.com / nodeseek.org / nodeimage.com /
 *   nodeget.com / nodequality.com / deepflood.com / ilatency.com / seek.li /
 *   22112211.xyz）：
 *   https://clash-rulesets.greenhat616.deno.net/rulesets/nodeseek.yml
 *
 * 幂等：重复执行不会产生重复的分组、规则或 rule-provider。
 */

/** 新分组名称 */
const NODESEEK_GROUP = "NodeSeek";
/** convert.js 中 PROXY_GROUPS.SELECT（默认选中项，同时用于继承动态地区节点候选项） */
const PROXY_GROUPS_SELECT = "选择代理";
/** convert.js 中 PROXY_GROUPS.MANUAL（仅在缺失「选择代理」分组时作兜底候选） */
const PROXY_GROUPS_MANUAL = "手动选择";
/** convert.js 中 PROXY_GROUPS.SSH（分组插入位置的优先锚点） */
const SSH_GROUP = "SSH";
/** convert.js 中 PROXY_GROUPS.FINAL（分组插入位置的兜底锚点） */
const FINAL_GROUP = "Final";
/** convert.js 中 PROXY_GROUPS.GLOBAL（Nyanpasu 兼容需挂载的分组） */
const GLOBAL_GROUP = "GLOBAL";

/** rule-provider 名称（与 RULE-SET 规则引用一致） */
const NODESEEK_PROVIDER = "nodeseek";
/** NodeSeek 域名 ruleset（classical yaml） */
const NODESEEK_RULESET_URL =
  "https://clash-rulesets.greenhat616.deno.net/rulesets/nodeseek.yml";

/**
 * NodeSeek 分组专属图标 —— NodeSeek 官方 favicon（512px PNG，透明背景）。
 * 主流图标集均无 NodeSeek 图标，故爬取官方资源
 * （https://www.nodeseek.com/static/image/favicon/android-chrome-512x512.png，
 * 已确认背景透明，无需额外处理）存至本仓库 icons/ 目录；可自行替换为其它图标集链接。
 */
const NODESEEK_ICON =
  "https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/icons/nodeseek.png";

/**
 * @param {Record<string, any>} config convert.js 生成的完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const rules = Array.isArray(config["rules"]) ? config["rules"] : [];

  // ── 1. 新增 NodeSeek 分组 ────────────────────────────────────────────────
  // 复用「选择代理」分组的候选项（convert.js 动态生成的地区节点分组），
  // 这些分组名不能写死，必须从实际配置读取。
  const selectGroup = groups.find((g) => g && g.name === PROXY_GROUPS_SELECT);
  const baseProxies =
    selectGroup && Array.isArray(selectGroup.proxies)
      ? selectGroup.proxies.slice()
      : [PROXY_GROUPS_MANUAL, "DIRECT"];

  // 把「选择代理」放首位 → select 默认选中首项，与拆分前（GFWList 兜底）行为一致。
  const nsProxies = [
    PROXY_GROUPS_SELECT,
    ...baseProxies.filter((p) => p !== PROXY_GROUPS_SELECT && p !== NODESEEK_GROUP),
  ];

  if (!groups.some((g) => g && g.name === NODESEEK_GROUP)) {
    const nsGroup = {
      name: NODESEEK_GROUP,
      type: "select",
      icon: NODESEEK_ICON,
      proxies: nsProxies, // select 类型默认选中数组首项 → 选择代理
    };

    // 插入位置逐级回退：「SSH」之前 → 「Final」之前 → 末尾。
    const sshIndex = groups.findIndex((g) => g && g.name === SSH_GROUP);
    if (sshIndex >= 0) groups.splice(sshIndex, 0, nsGroup);
    else {
      const finalIndex = groups.findIndex((g) => g && g.name === FINAL_GROUP);
      if (finalIndex >= 0) groups.splice(finalIndex, 0, nsGroup);
      else groups.push(nsGroup);
    }
  }

  // ── 2. Nyanpasu 兼容：把 NodeSeek 挂载进 GLOBAL 分组的 proxies ───────────
  // convert.js 的 GLOBAL 分组 proxies 为生成时的固定快照，不含后处理新增分组；
  // 其虽有 include-all，但 Nyanpasu 在 GLOBAL 模式下只展示/允许选择 proxies
  // 列表内的项，故需显式挂载（幂等）。
  const globalGroup = groups.find((g) => g && g.name === GLOBAL_GROUP);
  if (globalGroup && Array.isArray(globalGroup.proxies)) {
    if (!globalGroup.proxies.includes(NODESEEK_GROUP)) {
      // 插在 GLOBAL 列表首位，与「新分组在前」的展示习惯一致。
      globalGroup.proxies.unshift(NODESEEK_GROUP);
    }
  }

  // ── 3. 新增 rule-provider 与分流规则 ─────────────────────────────────────
  // 对齐 convert.js 的 rule-providers 写法（type/behavior/format/interval/path）。
  const providers =
    config["rule-providers"] && typeof config["rule-providers"] === "object"
      ? config["rule-providers"]
      : {};
  if (!providers[NODESEEK_PROVIDER]) {
    providers[NODESEEK_PROVIDER] = {
      type: "http",
      behavior: "domain",
      format: "yaml",
      interval: 86400,
      url: NODESEEK_RULESET_URL,
      path: "./ruleset/nodeseek.yaml",
    };
  }

  const nsRule = `RULE-SET,${NODESEEK_PROVIDER},${NODESEEK_GROUP}`;

  // 去重：移除可能已存在的同名规则后再插入。
  const deduped = rules.filter((r) => r !== nsRule);

  // 插到 GFWList 兜底规则之前，确保 NodeSeek 优先于通用代理规则命中；
  // 找不到则依次回退：cn 直连规则之前 → 最终 MATCH 之前 → 前置。
  const isStr = (r) => typeof r === "string";
  const anchors = [
    (r) => r.startsWith("RULE-SET,GFWList,"),
    (r) => r.startsWith("GEOIP,cn,"),
    (r) => r.startsWith("GEOSITE,cn,"),
    (r) => r.startsWith("MATCH,"),
  ];
  let insertIndex = -1;
  for (const match of anchors) {
    insertIndex = deduped.findIndex((r) => isStr(r) && match(r));
    if (insertIndex >= 0) break;
  }
  if (insertIndex >= 0) deduped.splice(insertIndex, 0, nsRule);
  else deduped.unshift(nsRule);

  config["proxy-groups"] = groups;
  config["rule-providers"] = providers;
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
