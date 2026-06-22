/**
 * HuggingFace 独立分组 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 配合 powerfullz/override-rules 的 convert.js 使用，作为「第二个」覆写脚本
 * 在其之后执行（Clash Verge Rev / Mihomo Party / Sparkle 均支持脚本链式执行）。
 *
 * 入参 config 为 convert.js 已经生成的完整配置对象，本脚本在其基础上：
 *   1. 新增「HuggingFace」proxy group（type: select），默认选中「AI服务」。
 *   2. 新增 huggingface 路由规则（GEOSITE，与原始脚本风格一致），置于
 *      `GEOSITE,category-ai-!cn` 规则之前，使 HuggingFace 流量优先命中独立分组。
 *
 * geosite 分类来源：v2fly/domain-list-community 仓库 data/huggingface
 *   https://github.com/v2fly/domain-list-community/blob/master/data/huggingface
 *
 * 幂等：重复执行不会产生重复的分组或规则。
 */

/** 新分组名称 */
const HUGGINGFACE_GROUP = "HuggingFace";
/** convert.js 中 AI 分组名称（PROXY_GROUPS.AI_SERVICE） */
const AI_SERVICE_GROUP = "AI服务";
/** convert.js 中 PROXY_GROUPS.SELECT / MANUAL（仅在缺失 AI 分组时作兜底候选） */
const PROXY_GROUPS_SELECT = "选择代理";
const PROXY_GROUPS_MANUAL = "手动选择";

/**
 * HuggingFace 分组专属图标 —— HuggingFace 官方 Logo（彩色 SVG）。
 * Koolson/Qure 图标集无 HF 图标，故采用官方资源；可自行替换为其它图标集链接。
 */
const HUGGINGFACE_ICON = "https://huggingface.co/front/assets/huggingface_logo-noborder.svg";

/**
 * @param {Record<string, any>} config convert.js 生成的完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const rules = Array.isArray(config["rules"]) ? config["rules"] : [];

  // ── 1. 新增 HuggingFace 分组 ────────────────────────────────────────────
  // 直接复用 convert.js 中 AI 分组（defaultProxies）的候选项：
  //   [选择代理, 落地节点?, 地区节点…, 低倍率节点?, 手动选择, DIRECT]
  // 这些地区节点分组由 override-rules 动态生成，因此不能写死，必须从实际配置读取。
  const aiGroup = groups.find((g) => g && g.name === AI_SERVICE_GROUP);
  const baseProxies =
    aiGroup && Array.isArray(aiGroup.proxies)
      ? aiGroup.proxies.slice()
      : [PROXY_GROUPS_SELECT, PROXY_GROUPS_MANUAL, "DIRECT"];

  // 把「AI服务」放首位 → select 默认选中首项，实现「默认选中 AI 服务」。
  const hfProxies = [
    AI_SERVICE_GROUP,
    ...baseProxies.filter((p) => p !== AI_SERVICE_GROUP && p !== HUGGINGFACE_GROUP),
  ];

  if (!groups.some((g) => g && g.name === HUGGINGFACE_GROUP)) {
    const hfGroup = {
      name: HUGGINGFACE_GROUP,
      type: "select",
      icon: HUGGINGFACE_ICON,
      proxies: hfProxies, // select 类型默认选中数组首项 → AI服务
    };

    // 紧跟在「AI服务」之后插入，保持分组顺序直观；找不到则追加到末尾。
    const aiIndex = groups.findIndex((g) => g && g.name === AI_SERVICE_GROUP);
    if (aiIndex >= 0) groups.splice(aiIndex + 1, 0, hfGroup);
    else groups.push(hfGroup);
  }

  // ── 2. 新增 huggingface 分流规则 ────────────────────────────────────────
  // 仅用 GEOSITE（与原始脚本一致），依赖客户端 geosite.dat 的 huggingface 分类。
  const hfRule = `GEOSITE,huggingface,${HUGGINGFACE_GROUP}`;

  // 去重：移除可能已存在的同名规则后再插入。
  const deduped = rules.filter((r) => r !== hfRule);

  // 插到 category-ai-!cn 之前，确保 HuggingFace 优先于通用 AI 规则命中。
  const aiRuleIndex = deduped.findIndex(
    (r) => typeof r === "string" && r.includes("category-ai-!cn")
  );
  if (aiRuleIndex >= 0) deduped.splice(aiRuleIndex, 0, hfRule);
  else deduped.unshift(hfRule);

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
