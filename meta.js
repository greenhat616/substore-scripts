/**
 * Meta 独立分组 —— Mihomo / Clash 全局覆写「后处理脚本」
 * ---------------------------------------------------------------------------
 * 配合 powerfullz/override-rules 的 convert.js 使用，作为「第二个」覆写脚本
 * 在其之后执行（Clash Verge Rev / Mihomo Party / Sparkle 均支持脚本链式执行）。
 *
 * 入参 config 为 convert.js 已经生成的完整配置对象，本脚本在其基础上：
 *   1. 新增「Meta」proxy group（type: select），默认选中「选择代理」。
 *      覆盖 Facebook / Instagram / Messenger / WhatsApp / Threads /
 *      Oculus(Quest) 等全部 Meta 服务（上游 convert.js 无 Meta 专属规则，
 *      这些流量原本由 GFWList 兜底到「选择代理」，故默认行为与拆分前一致）。
 *   2. 新增 meta 路由规则（GEOSITE，与原始脚本风格一致），置于
 *      `RULE-SET,GFWList` 规则之前，使 Meta 流量优先命中独立分组。
 *   3. Nyanpasu 兼容：convert.js 生成的 GLOBAL 分组 proxies 为固定列表
 *      （不含后处理新增分组），需将「Meta」挂载进 GLOBAL 分组的
 *      proxies，否则 Nyanpasu 在 GLOBAL 模式下无法选中该分组。
 *      见 https://github.com/libnyanpasu/clash-nyanpasu/issues/5112
 *
 * geosite 分类来源：v2fly/domain-list-community 仓库 data/meta（聚合分类：
 *   include:facebook / facebook-dev / instagram / messenger / oculus / threads
 *   / whatsapp，外加 meta.com / meta.ai / llama.com 等）
 *   https://github.com/v2fly/domain-list-community/blob/master/data/meta
 *
 * 幂等：重复执行不会产生重复的分组或规则。
 */

/** 新分组名称 */
const META_GROUP = "Meta";
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

/**
 * Meta 分组专属图标 —— Meta 官方 Logo（PNG）。
 * Koolson/Qure、Orz-3/mini 等主流图标集均无 Meta 图标（仅有 Facebook /
 * Instagram 单服务图标），故爬取官方品牌资源（Simple Icons 收录的官方
 * Logomark）存至本仓库 icons/ 目录并渲染为 PNG（SVG 为原始素材，
 * 见 icons/meta.svg）；可自行替换为其它图标集链接。
 */
const META_ICON = "https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/icons/meta.png";

/**
 * @param {Record<string, any>} config convert.js 生成的完整 Mihomo 配置
 * @returns {Record<string, any>}
 */
function main(config) {
  if (!config || typeof config !== "object") return config;

  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const rules = Array.isArray(config["rules"]) ? config["rules"] : [];

  // ── 1. 新增 Meta 分组 ───────────────────────────────────────────────────
  // 复用「选择代理」分组的候选项（convert.js 动态生成的地区节点分组），
  // 这些分组名不能写死，必须从实际配置读取。
  const selectGroup = groups.find((g) => g && g.name === PROXY_GROUPS_SELECT);
  const baseProxies =
    selectGroup && Array.isArray(selectGroup.proxies)
      ? selectGroup.proxies.slice()
      : [PROXY_GROUPS_MANUAL, "DIRECT"];

  // 把「选择代理」放首位 → select 默认选中首项，与拆分前（GFWList 兜底）行为一致。
  const metaProxies = [
    PROXY_GROUPS_SELECT,
    ...baseProxies.filter((p) => p !== PROXY_GROUPS_SELECT && p !== META_GROUP),
  ];

  if (!groups.some((g) => g && g.name === META_GROUP)) {
    const metaGroup = {
      name: META_GROUP,
      type: "select",
      icon: META_ICON,
      proxies: metaProxies, // select 类型默认选中数组首项 → 选择代理
    };

    // 插入位置逐级回退：「SSH」之前 → 「Final」之前 → 末尾。
    const sshIndex = groups.findIndex((g) => g && g.name === SSH_GROUP);
    if (sshIndex >= 0) groups.splice(sshIndex, 0, metaGroup);
    else {
      const finalIndex = groups.findIndex((g) => g && g.name === FINAL_GROUP);
      if (finalIndex >= 0) groups.splice(finalIndex, 0, metaGroup);
      else groups.push(metaGroup);
    }
  }

  // ── 2. Nyanpasu 兼容：把 Meta 挂载进 GLOBAL 分组的 proxies ──────────────
  // convert.js 的 GLOBAL 分组 proxies 为生成时的固定快照，不含后处理新增分组；
  // 而 Nyanpasu 以 GLOBAL.all 的顺序枚举并展示代理组（proxies.rs:143），
  // 未挂载的组会被静默丢弃（clash-nyanpasu#5112）。
  // 挂载位置与上方分组插入位置保持一致（插到其后邻分组名之前），避免新分组
  // 排到「选择代理」等原有分组之前、打乱展示顺序。
  const globalGroup = groups.find((g) => g && g.name === GLOBAL_GROUP);
  if (
    globalGroup &&
    Array.isArray(globalGroup.proxies) &&
    !globalGroup.proxies.includes(META_GROUP)
  ) {
    const selfIndex = groups.findIndex((g) => g && g.name === META_GROUP);
    const nextName = groups
      .slice(selfIndex + 1)
      .map((g) => g && g.name)
      .find((name) => name && name !== GLOBAL_GROUP && globalGroup.proxies.includes(name));
    if (nextName) {
      globalGroup.proxies.splice(globalGroup.proxies.indexOf(nextName), 0, META_GROUP);
    } else {
      globalGroup.proxies.push(META_GROUP);
    }
  }

  // ── 3. 新增 meta 分流规则 ───────────────────────────────────────────────
  // 仅用 GEOSITE（与原始脚本一致），依赖客户端 geosite.dat 的 meta 聚合分类。
  const metaRule = `GEOSITE,meta,${META_GROUP}`;

  // 去重：移除可能已存在的同名规则后再插入。
  const deduped = rules.filter((r) => r !== metaRule);

  // 插到 GFWList 兜底规则之前，确保 Meta 优先于通用代理规则命中；
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
  if (insertIndex >= 0) deduped.splice(insertIndex, 0, metaRule);
  else deduped.unshift(metaRule);

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
