"use strict";

/**
 * 无网络冒烟测试：验证后处理脚本对 convert.js 输出的最小改造正确性。
 * 运行：node ./test/smoke.test.js
 */

const assert = require("node:assert");
const main = require("../huggingface.js");

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

console.log("✓ all smoke tests passed");
