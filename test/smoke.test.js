"use strict";

/**
 * 无网络冒烟测试：验证后处理脚本对 convert.js 输出的最小改造正确性。
 * 运行：node ./test/smoke.test.js
 */

const assert = require("node:assert");
const main = require("../huggingface.js");
const tailscale = require("../tailscale.js");
const meta = require("../meta.js");
const nodeseek = require("../nodeseek.js");
const dialerProxy = require("../dialer-proxy-qianzhi.js");

function fakeConfig() {
  return {
    proxies: [{ name: "node-1" }],
    "proxy-groups": [
      {
        name: "AI服务",
        type: "select",
        icon: "https://example.com/ChatGPT.png",
        proxies: ["选择代理", "自动选择", "手动选择", "DIRECT"],
      },
      {
        name: "GLOBAL",
        type: "select",
        "include-all": true,
        proxies: ["AI服务"],
      },
    ],
    rules: [
      "GEOSITE,github,Github",
      "GEOSITE,category-ai-!cn,AI服务",
      "MATCH,Final",
    ],
  };
}

// 1. 基本改造
{
  const out = main(fakeConfig());
  const hf = out["proxy-groups"].find((g) => g.name === "HuggingFace");
  assert.ok(hf, "应新增 HuggingFace 分组");
  assert.strictEqual(hf.type, "select");
  assert.strictEqual(hf.proxies[0], "AI服务", "默认选中项应为 AI服务");
  assert.ok(/huggingface/i.test(hf.icon), "应使用 HuggingFace 专属图标");
  // 候选项应继承 AI 分组的动态地区节点列表
  assert.deepStrictEqual(
    hf.proxies,
    ["AI服务", "选择代理", "自动选择", "手动选择", "DIRECT"],
    "候选项应为 [AI服务, 选择代理, 地区节点…, 手动选择, DIRECT]"
  );

  // HuggingFace 分组应插在 AI服务 之前
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("HuggingFace") + 1, names.indexOf("AI服务"));

  // Nyanpasu 兼容：GLOBAL 分组 proxies 应挂载 HuggingFace，且位置镜像分组插入位置
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.deepStrictEqual(
    globalGroup.proxies,
    ["HuggingFace", "AI服务"],
    "HuggingFace 应挂载到 GLOBAL 且位于 AI服务 之前（镜像分组插入位置）"
  );

  // 规则应插入到 category-ai-!cn 之前
  const idxHF = out.rules.indexOf("GEOSITE,huggingface,HuggingFace");
  const idxAI = out.rules.findIndex((r) => r.includes("category-ai-!cn"));
  assert.ok(idxHF >= 0 && idxHF < idxAI, "huggingface 规则应在 category-ai-!cn 之前");

  // 仅 GEOSITE，不应引入 DOMAIN-SUFFIX 规则
  assert.ok(
    !out.rules.some((r) => typeof r === "string" && r.startsWith("DOMAIN-SUFFIX,")),
    "不应包含 DOMAIN-SUFFIX 兜底规则"
  );
}

// 2. 幂等：重复执行不产生重复分组/规则
{
  let out = main(fakeConfig());
  out = main(out);
  const hfGroups = out["proxy-groups"].filter((g) => g.name === "HuggingFace");
  assert.strictEqual(hfGroups.length, 1, "重复执行不应产生重复分组");
  const hfRuleCount = out.rules.filter((r) => r === "GEOSITE,huggingface,HuggingFace").length;
  assert.strictEqual(hfRuleCount, 1, "重复执行不应产生重复规则");
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.strictEqual(
    globalGroup.proxies.filter((p) => p === "HuggingFace").length,
    1,
    "重复执行不应在 GLOBAL 中重复挂载"
  );
}

// 3. 缺失 AI服务 分组时的回退：Final 之前 → 末尾
{
  // 有 Final 分组时插到其之前
  const cfgWithFinal = {
    "proxy-groups": [{ name: "选择代理", type: "select", proxies: ["DIRECT"] }, { name: "Final", type: "select", proxies: ["DIRECT"] }],
    rules: ["MATCH,Final"],
  };
  const outF = main(cfgWithFinal);
  const namesF = outF["proxy-groups"].map((g) => g.name);
  assert.strictEqual(namesF.indexOf("HuggingFace") + 1, namesF.indexOf("Final"), "无 AI服务 时应插在 Final 之前");

  // 均无则追加到末尾
  const cfg = { "proxy-groups": [], rules: ["MATCH,Final"] };
  const out = main(cfg);
  const hf = out["proxy-groups"].find((g) => g.name === "HuggingFace");
  assert.ok(hf, "无 AI服务 分组时仍应创建 HuggingFace 分组");
  assert.strictEqual(hf.proxies[0], "AI服务");
  // 无 category-ai-!cn 时规则前置
  assert.strictEqual(out.rules[0], "GEOSITE,huggingface,HuggingFace");
}

console.log("✓ huggingface smoke tests passed");

// ── tailscale.js ─────────────────────────────────────────────────────────────

function fakeConfigTS() {
  return {
    proxies: [{ name: "node-1" }],
    "proxy-groups": [
      {
        name: "选择代理",
        type: "select",
        proxies: ["自动选择", "香港节点", "手动选择", "DIRECT"],
      },
      { name: "SSH", type: "select", proxies: ["选择代理", "DIRECT"] },
      { name: "Final", type: "select", proxies: ["选择代理", "DIRECT"] },
      {
        name: "GLOBAL",
        type: "select",
        "include-all": true,
        proxies: ["选择代理", "SSH", "Final"],
      },
    ],
    rules: [
      "GEOSITE,category-ai-!cn,AI服务",
      "GEOSITE,cn,直连",
      "GEOIP,CN,直连",
      "MATCH,Final",
    ],
  };
}

// 4. 基本改造
{
  const out = tailscale(fakeConfigTS());
  const ts = out["proxy-groups"].find((g) => g.name === "Tailscale");
  assert.ok(ts, "应新增 Tailscale 分组");
  assert.strictEqual(ts.type, "select");
  assert.strictEqual(ts.proxies[0], "DIRECT", "默认选中项应为 DIRECT");
  assert.ok(/tailscale/i.test(ts.icon), "应使用 Tailscale 专属图标");
  // 候选项应继承「选择代理」分组的动态地区节点列表，DIRECT 提前且不重复
  assert.deepStrictEqual(
    ts.proxies,
    ["DIRECT", "自动选择", "香港节点", "手动选择"],
    "候选项应为 [DIRECT, …选择代理候选项（去重 DIRECT）]"
  );

  // Tailscale 分组应插在 SSH 之前
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("Tailscale") + 1, names.indexOf("SSH"));

  // Nyanpasu 兼容：GLOBAL 分组 proxies 应挂载 Tailscale，且位置镜像分组插入位置
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.deepStrictEqual(
    globalGroup.proxies,
    ["选择代理", "Tailscale", "SSH", "Final"],
    "Tailscale 应挂载到 GLOBAL 且位于 SSH 之前（镜像分组插入位置）"
  );

  // 规则应插入到 GEOSITE,cn 之前
  const idxTS = out.rules.indexOf("GEOSITE,tailscale,Tailscale");
  const idxCN = out.rules.findIndex((r) => r.startsWith("GEOSITE,cn,"));
  assert.ok(idxTS >= 0 && idxTS < idxCN, "tailscale 规则应在 GEOSITE,cn 之前");
}

// 5. 幂等：重复执行不产生重复分组/规则
{
  let out = tailscale(fakeConfigTS());
  out = tailscale(out);
  const tsGroups = out["proxy-groups"].filter((g) => g.name === "Tailscale");
  assert.strictEqual(tsGroups.length, 1, "重复执行不应产生重复分组");
  const tsRuleCount = out.rules.filter((r) => r === "GEOSITE,tailscale,Tailscale").length;
  assert.strictEqual(tsRuleCount, 1, "重复执行不应产生重复规则");
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.strictEqual(
    globalGroup.proxies.filter((p) => p === "Tailscale").length,
    1,
    "重复执行不应在 GLOBAL 中重复挂载"
  );
}

// 6. 缺失锚点分组 / 无 GEOSITE,cn 规则时的回退
{
  // 无 SSH 但有 Final 时插到 Final 之前
  const cfgFinal = {
    "proxy-groups": [{ name: "Final", type: "select", proxies: ["DIRECT"] }],
    rules: ["MATCH,Final"],
  };
  const outF = tailscale(cfgFinal);
  const namesF = outF["proxy-groups"].map((g) => g.name);
  assert.strictEqual(namesF.indexOf("Tailscale") + 1, namesF.indexOf("Final"), "无 SSH 时应插在 Final 之前");

  // 均无则追加到末尾
  const cfg = { "proxy-groups": [], rules: ["MATCH,Final"] };
  const out = tailscale(cfg);
  const ts = out["proxy-groups"].find((g) => g.name === "Tailscale");
  assert.ok(ts, "无锚点分组时仍应创建 Tailscale 分组");
  assert.strictEqual(ts.proxies[0], "DIRECT");
  assert.strictEqual(out["proxy-groups"][out["proxy-groups"].length - 1].name, "Tailscale");
  // 无 GEOSITE,cn 时规则置于最终 MATCH 之前
  assert.strictEqual(out.rules[0], "GEOSITE,tailscale,Tailscale");
  assert.strictEqual(out.rules[1], "MATCH,Final");
}

console.log("✓ tailscale smoke tests passed");

// ── meta.js ──────────────────────────────────────────────────────────────────

function fakeConfigMeta() {
  return {
    proxies: [{ name: "node-1" }],
    "proxy-groups": [
      {
        name: "选择代理",
        type: "select",
        proxies: ["自动选择", "香港节点", "手动选择", "DIRECT"],
      },
      { name: "SSH", type: "select", proxies: ["选择代理", "DIRECT"] },
      { name: "Final", type: "select", proxies: ["选择代理", "DIRECT"] },
      {
        name: "GLOBAL",
        type: "select",
        "include-all": true,
        proxies: ["选择代理", "SSH", "Final"],
      },
    ],
    rules: [
      "GEOSITE,twitter,Twitter",
      "RULE-SET,GFWList,选择代理",
      "GEOIP,cn,DIRECT",
      "MATCH,Final",
    ],
  };
}

// 7. 基本改造
{
  const out = meta(fakeConfigMeta());
  const mg = out["proxy-groups"].find((g) => g.name === "Meta");
  assert.ok(mg, "应新增 Meta 分组");
  assert.strictEqual(mg.type, "select");
  assert.strictEqual(mg.proxies[0], "选择代理", "默认选中项应为 选择代理");
  assert.ok(/meta/i.test(mg.icon), "应使用 Meta 专属图标");
  // 候选项应继承「选择代理」分组的动态地区节点列表
  assert.deepStrictEqual(
    mg.proxies,
    ["选择代理", "自动选择", "香港节点", "手动选择", "DIRECT"],
    "候选项应为 [选择代理, 地区节点…, 手动选择, DIRECT]"
  );

  // Meta 分组应插在 SSH 之前
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("Meta") + 1, names.indexOf("SSH"));

  // Nyanpasu 兼容：GLOBAL 分组 proxies 应挂载 Meta，且位置镜像分组插入位置
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.deepStrictEqual(
    globalGroup.proxies,
    ["选择代理", "Meta", "SSH", "Final"],
    "Meta 应挂载到 GLOBAL 且位于 SSH 之前（镜像分组插入位置）"
  );

  // 规则应插入到 GFWList 兜底规则之前
  const idxMeta = out.rules.indexOf("GEOSITE,meta,Meta");
  const idxGFW = out.rules.findIndex((r) => r.startsWith("RULE-SET,GFWList,"));
  assert.ok(idxMeta >= 0 && idxMeta < idxGFW, "meta 规则应在 GFWList 之前");
}

// 8. 幂等：重复执行不产生重复分组/规则
{
  let out = meta(fakeConfigMeta());
  out = meta(out);
  const metaGroups = out["proxy-groups"].filter((g) => g.name === "Meta");
  assert.strictEqual(metaGroups.length, 1, "重复执行不应产生重复分组");
  const metaRuleCount = out.rules.filter((r) => r === "GEOSITE,meta,Meta").length;
  assert.strictEqual(metaRuleCount, 1, "重复执行不应产生重复规则");
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.strictEqual(
    globalGroup.proxies.filter((p) => p === "Meta").length,
    1,
    "重复执行不应在 GLOBAL 中重复挂载"
  );
}

// 9. 缺失锚点分组 / 无 GFWList 规则时的逐级回退
{
  // 无 GFWList 但有 GEOIP,cn 时规则插到其之前
  const cfgGeoip = { "proxy-groups": [], rules: ["GEOIP,cn,DIRECT", "MATCH,Final"] };
  const outG = meta(cfgGeoip);
  assert.strictEqual(outG.rules[0], "GEOSITE,meta,Meta");
  assert.strictEqual(outG.rules[1], "GEOIP,cn,DIRECT");

  // 仅有 MATCH 时规则插到其之前；无锚点分组时追加到末尾
  const cfg = { "proxy-groups": [], rules: ["MATCH,Final"] };
  const out = meta(cfg);
  assert.strictEqual(out.rules[0], "GEOSITE,meta,Meta");
  assert.strictEqual(out.rules[1], "MATCH,Final");
  const mg = out["proxy-groups"].find((g) => g.name === "Meta");
  assert.ok(mg, "无锚点分组时仍应创建 Meta 分组");
  assert.strictEqual(mg.proxies[0], "选择代理");
  assert.strictEqual(out["proxy-groups"][out["proxy-groups"].length - 1].name, "Meta");
}

console.log("✓ meta smoke tests passed");

// ── nodeseek.js ──────────────────────────────────────────────────────────────

function fakeConfigNS() {
  return {
    proxies: [{ name: "node-1" }],
    "proxy-groups": [
      {
        name: "选择代理",
        type: "select",
        proxies: ["自动选择", "香港节点", "手动选择", "DIRECT"],
      },
      { name: "SSH", type: "select", proxies: ["选择代理", "DIRECT"] },
      { name: "Final", type: "select", proxies: ["选择代理", "DIRECT"] },
      {
        name: "GLOBAL",
        type: "select",
        "include-all": true,
        proxies: ["选择代理", "SSH", "Final"],
      },
    ],
    rules: [
      "GEOSITE,twitter,Twitter",
      "RULE-SET,GFWList,选择代理",
      "GEOIP,cn,DIRECT",
      "MATCH,Final",
    ],
  };
}

// 10. 基本改造：分组 / 规则 / rule-provider / GLOBAL 挂载
{
  const out = nodeseek(fakeConfigNS());
  const ns = out["proxy-groups"].find((g) => g.name === "NodeSeek");
  assert.ok(ns, "应新增 NodeSeek 分组");
  assert.strictEqual(ns.type, "select");
  assert.strictEqual(ns.proxies[0], "选择代理", "默认选中项应为 选择代理");
  assert.ok(/nodeseek/i.test(ns.icon), "应使用 NodeSeek 专属图标");
  // 候选项应继承「选择代理」分组的动态地区节点列表
  assert.deepStrictEqual(
    ns.proxies,
    ["选择代理", "自动选择", "香港节点", "手动选择", "DIRECT"],
    "候选项应为 [选择代理, 地区节点…, 手动选择, DIRECT]"
  );

  // NodeSeek 分组应插在 SSH 之前
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("NodeSeek") + 1, names.indexOf("SSH"));

  // Nyanpasu 兼容：GLOBAL 分组 proxies 应挂载 NodeSeek，且位置镜像分组插入位置
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.deepStrictEqual(
    globalGroup.proxies,
    ["选择代理", "NodeSeek", "SSH", "Final"],
    "NodeSeek 应挂载到 GLOBAL 且位于 SSH 之前（镜像分组插入位置）"
  );

  // 应新增 rule-provider「nodeseek」
  const provider = out["rule-providers"] && out["rule-providers"].nodeseek;
  assert.ok(provider, "应新增 nodeseek rule-provider");
  assert.strictEqual(provider.behavior, "domain");
  assert.strictEqual(provider.format, "yaml");
  assert.ok(provider.url.endsWith("/rulesets/nodeseek.yml"), "rule-provider 应指向 nodeseek ruleset");

  // 规则应插入到 GFWList 兜底规则之前
  const idxNS = out.rules.indexOf("RULE-SET,nodeseek,NodeSeek");
  const idxGFW = out.rules.findIndex((r) => r.startsWith("RULE-SET,GFWList,"));
  assert.ok(idxNS >= 0 && idxNS < idxGFW, "nodeseek 规则应在 GFWList 之前");
}

// 11. 幂等：重复执行不产生重复分组/规则/provider/GLOBAL 挂载
{
  let out = nodeseek(fakeConfigNS());
  out = nodeseek(out);
  const nsGroups = out["proxy-groups"].filter((g) => g.name === "NodeSeek");
  assert.strictEqual(nsGroups.length, 1, "重复执行不应产生重复分组");
  const nsRuleCount = out.rules.filter((r) => r === "RULE-SET,nodeseek,NodeSeek").length;
  assert.strictEqual(nsRuleCount, 1, "重复执行不应产生重复规则");
  assert.strictEqual(Object.keys(out["rule-providers"]).length, 1, "重复执行不应产生重复 provider");
  const globalGroup = out["proxy-groups"].find((g) => g.name === "GLOBAL");
  assert.strictEqual(
    globalGroup.proxies.filter((p) => p === "NodeSeek").length,
    1,
    "重复执行不应在 GLOBAL 中重复挂载"
  );
}

// 12. 缺失锚点分组 / 无 GFWList 规则 / 无 GLOBAL 时的逐级回退
{
  // 无 SSH 但有 Final 时插到 Final 之前；仅有 MATCH 时规则插到其之前
  const cfg = {
    "proxy-groups": [{ name: "Final", type: "select", proxies: ["DIRECT"] }],
    rules: ["GEOIP,cn,DIRECT", "MATCH,Final"],
  };
  const out = nodeseek(cfg);
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("NodeSeek") + 1, names.indexOf("Final"), "无 SSH 时应插在 Final 之前");
  assert.strictEqual(out.rules[0], "RULE-SET,nodeseek,NodeSeek");
  assert.strictEqual(out.rules[1], "GEOIP,cn,DIRECT");
  // 无 GLOBAL 分组时不应抛错
  assert.ok(!out["proxy-groups"].some((g) => g.name === "GLOBAL"));
}

console.log("✓ nodeseek smoke tests passed");

// ── dialer-proxy-qianzhi.js ────────────────────────────────────────────────

// 13. 命中条件：socks5/http 或名称含家宽关键词，满足其一即注入 dialer-proxy
{
  const cfg = {
    proxies: [
      { name: "日本家宽落地", type: "socks5", server: "1.2.3.4" },
      { name: "美国住宅IP", type: "http", server: "5.6.7.8" },
      { name: "US 家宽 [Aaitr LAX AT&T]", type: "hysteria2" }, // 名称命中 → 注入
      { name: "新加坡直连", type: "socks5" }, // 协议命中 → 注入
      { name: "普通trojan", type: "trojan" }, // 均不命中 → 不注入
    ],
  };
  const out = dialerProxy(cfg);
  assert.strictEqual(out.proxies[0]["dialer-proxy"], "前置代理");
  assert.strictEqual(out.proxies[1]["dialer-proxy"], "前置代理");
  assert.strictEqual(out.proxies[2]["dialer-proxy"], "前置代理", "名称命中即可，不限协议");
  assert.strictEqual(out.proxies[3]["dialer-proxy"], "前置代理", "协议命中即可，不限名称");
  assert.ok(!("dialer-proxy" in out.proxies[4]), "均不命中不应注入");
}

// 14. 健壮性：缺失/异常输入不抛错
{
  assert.strictEqual(dialerProxy(null), null);
  const cfg = { proxies: null };
  assert.strictEqual(dialerProxy(cfg), cfg);
  const out = dialerProxy({ proxies: [{ name: "直连", type: "SOCKS5" }] });
  assert.strictEqual(out.proxies[0]["dialer-proxy"], "前置代理", "协议大小写不敏感");
}

console.log("✓ all smoke tests passed");

// ── nyanpasu-dns.js ──────────────────────────────────────────────────────────

const nyanpasuDns = require("../nyanpasu-dns.js");

// 15. 基本改造：'system' 提到首位
{
  const cfg = { dns: { "proxy-server-nameserver": ["223.5.5.5", "8.8.8.8"] } };
  const out = nyanpasuDns(cfg);
  assert.deepStrictEqual(out.dns["proxy-server-nameserver"], ["system", "223.5.5.5", "8.8.8.8"]);
}

// 16. 去重：已含 'system' 不再重复 prepend，数组整体去重
{
  const cfg = { dns: { "proxy-server-nameserver": ["system", "223.5.5.5", "223.5.5.5", ""] } };
  const out = nyanpasuDns(cfg);
  assert.deepStrictEqual(out.dns["proxy-server-nameserver"], ["system", "223.5.5.5"]);

  // 'system' 在中间时也应提到首位且不重复
  const cfg2 = { dns: { "proxy-server-nameserver": ["223.5.5.5", "system", "8.8.8.8"] } };
  const out2 = nyanpasuDns(cfg2);
  assert.deepStrictEqual(out2.dns["proxy-server-nameserver"], ["system", "223.5.5.5", "8.8.8.8"]);
}

// 17. 幂等：重复执行结果不变
{
  const cfg = { dns: { "proxy-server-nameserver": ["223.5.5.5"] } };
  let out = nyanpasuDns(cfg);
  out = nyanpasuDns(out);
  assert.deepStrictEqual(out.dns["proxy-server-nameserver"], ["system", "223.5.5.5"]);
}

// 18. 健壮性：缺失/异常输入不抛错、不改动
{
  assert.strictEqual(nyanpasuDns(null), null);
  const noDns = { proxies: [] };
  assert.strictEqual(nyanpasuDns(noDns), noDns);
  const notArray = { dns: { "proxy-server-nameserver": "223.5.5.5" } };
  assert.strictEqual(nyanpasuDns(notArray).dns["proxy-server-nameserver"], "223.5.5.5");
}

console.log("✓ nyanpasu-dns smoke tests passed");
