"use strict";

/**
 * 无网络冒烟测试：验证后处理脚本对 convert.js 输出的最小改造正确性。
 * 运行：node ./test/smoke.test.js
 */

const assert = require("node:assert");
const main = require("../huggingface.js");
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

  // HuggingFace 分组应紧跟 AI服务 之后
  const names = out["proxy-groups"].map((g) => g.name);
  assert.strictEqual(names.indexOf("HuggingFace"), names.indexOf("AI服务") + 1);

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
}

// 3. 缺失 AI服务 分组时的回退
{
  const cfg = { "proxy-groups": [], rules: ["MATCH,Final"] };
  const out = main(cfg);
  const hf = out["proxy-groups"].find((g) => g.name === "HuggingFace");
  assert.ok(hf, "无 AI服务 分组时仍应创建 HuggingFace 分组");
  assert.strictEqual(hf.proxies[0], "AI服务");
  // 无 category-ai-!cn 时规则前置
  assert.strictEqual(out.rules[0], "GEOSITE,huggingface,HuggingFace");
}

console.log("✓ huggingface smoke tests passed");

// ── dialer-proxy-qianzhi.js ────────────────────────────────────────────────

// 4. 命中条件：socks5/http 且名称含家宽关键词 → 注入 dialer-proxy
{
  const cfg = {
    proxies: [
      { name: "日本家宽落地", type: "socks5", server: "1.2.3.4" },
      { name: "美国住宅IP", type: "http", server: "5.6.7.8" },
      { name: "香港原生节点", type: "socks5" },
      { name: "新加坡直连", type: "socks5" }, // 名称不命中 → 不注入
      { name: "家宽但协议不对", type: "ss" }, // 协议不命中 → 不注入
      { name: "普通trojan", type: "trojan" },
    ],
  };
  const out = dialerProxy(cfg);
  assert.strictEqual(out.proxies[0]["dialer-proxy"], "前置代理");
  assert.strictEqual(out.proxies[1]["dialer-proxy"], "前置代理");
  assert.strictEqual(out.proxies[2]["dialer-proxy"], "前置代理");
  assert.ok(!("dialer-proxy" in out.proxies[3]), "名称不命中不应注入");
  assert.ok(!("dialer-proxy" in out.proxies[4]), "协议不命中不应注入");
  assert.ok(!("dialer-proxy" in out.proxies[5]), "普通节点不应注入");
}

// 5. 健壮性：缺失/异常输入不抛错
{
  assert.strictEqual(dialerProxy(null), null);
  const cfg = { proxies: null };
  assert.strictEqual(dialerProxy(cfg), cfg);
  const out = dialerProxy({ proxies: [{ name: "家宽", type: "SOCKS5" }] });
  assert.strictEqual(out.proxies[0]["dialer-proxy"], "前置代理", "协议大小写不敏感");
}

console.log("✓ all smoke tests passed");
