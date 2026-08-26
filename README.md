# substore-scripts · HuggingFace / Tailscale / Meta / NodeSeek 独立分组

Mihomo / Clash 全局覆写「**后处理脚本**」。在 [`powerfullz/override-rules`](https://github.com/powerfullz/override-rules) 的 `convert.js` **之后**链式执行，在其生成的配置基础上做最小改造。

> 分组插入位置统一逐级回退：**优先锚点分组之前** → **「Final」分组之前** → **追加到末尾**。优先锚点：huggingface.js 为「AI服务」，其余脚本为「SSH」。
>
> **Nyanpasu 兼容**：`convert.js` 生成的 GLOBAL 分组 `proxies` 为生成时的固定快照（不含后处理新增分组）。Nyanpasu 以 `GLOBAL.all` 的**顺序**枚举并展示代理组（`proxies.rs:143`），未挂载的组会被静默丢弃（见 [clash-nyanpasu#5112](https://github.com/libnyanpasu/clash-nyanpasu/issues/5112)，上游修复前需此 workaround）。故所有脚本都会把各自新增的分组显式挂载到 GLOBAL 分组的 `proxies` 中（幂等，不重复），**挂载位置镜像分组在 `proxy-groups` 中的插入位置**（插到其后邻分组名之前，兜底追加末尾），不打乱原有展示顺序。

## huggingface.js · HuggingFace 独立分组

1. 新增 **「HuggingFace」** proxy group（`type: select`），**默认选中「AI服务」**，分组插在「AI服务」之前（缺失则按上方回退链）。
2. 新增 `GEOSITE,huggingface` 分流规则，置于 `GEOSITE,category-ai-!cn` 之前，使 HuggingFace 流量优先命中独立分组。

> geosite 分类来源：[v2fly/domain-list-community · `data/huggingface`](https://github.com/v2fly/domain-list-community/blob/master/data/huggingface) —— `hf.co`、`hf.space`、`huggingface.co`，已编入主流 `geosite.dat` 的 `huggingface` 分类。

## tailscale.js · Tailscale 独立分组

1. 新增 **「Tailscale」** proxy group（`type: select`），**默认选中 DIRECT**，分组插在「SSH」之前（缺失则按上方回退链）。Tailscale 是 mesh VPN，控制面 / DERP 流量经代理转发会形成回环，故默认直连，用户可手动切换为任意代理分组（候选项继承「选择代理」的动态地区节点列表）。
2. 新增 `GEOSITE,tailscale` 分流规则，置于 `GEOSITE,cn` 之前（找不到则置于最终 `MATCH` 之前）。

> geosite 分类来源：[v2fly/domain-list-community · `data/tailscale`](https://github.com/v2fly/domain-list-community/blob/master/data/tailscale) —— `tailscale.com`、`tailscale.io`、`ts.net`。
>
> 图标：Koolson/Qure、Orz-3/mini 等主流图标集均无 Tailscale 图标，故爬取官方 Logomark（`https://tailscale.com/favicon.svg`）存至本仓库 [`icons/`](icons) 并渲染为 PNG（SVG 为原始素材），经 jsDelivr 引用。

## meta.js · Meta 独立分组

1. 新增 **「Meta」** proxy group（`type: select`），**默认选中「选择代理」**，分组插在「SSH」之前（缺失则按上方回退链）。覆盖 Facebook / Instagram / Messenger / WhatsApp / Threads / Oculus(Quest) 等全部 Meta 服务——上游 `convert.js` 无 Meta 专属规则，这些流量原本由 GFWList 兜底到「选择代理」，故默认行为与拆分前一致（候选项继承「选择代理」的动态地区节点列表）。
2. 新增 `GEOSITE,meta` 分流规则，置于 `RULE-SET,GFWList` 之前（逐级回退：`GEOIP,cn` / `GEOSITE,cn` → 最终 `MATCH`），使 Meta 流量优先命中独立分组。

> geosite 分类来源：[v2fly/domain-list-community · `data/meta`](https://github.com/v2fly/domain-list-community/blob/master/data/meta) —— 聚合分类（`include:facebook / facebook-dev / instagram / messenger / oculus / threads / whatsapp`，外加 `meta.com`、`meta.ai`、`llama.com` 等）。
>
> 图标：Koolson/Qure、Orz-3/mini 等主流图标集均无 Meta 图标（仅有 Facebook / Instagram 单服务图标），故爬取官方品牌 Logomark（Simple Icons 收录）存至本仓库 [`icons/`](icons) 并渲染为 PNG（SVG 为原始素材），经 jsDelivr 引用。

## nodeseek.js · NodeSeek 独立分组

1. 新增 **「NodeSeek」** proxy group（`type: select`），**默认选中「选择代理」**，分组插在「SSH」之前（缺失则按上方回退链）。覆盖 NodeSeek 主站及其衍生服务（NodeImage / NodeGet / NodeQuality / DeepFlood 等）——上游 `convert.js` 无 NodeSeek 专属规则，这些流量原本由 GFWList 兜底到「选择代理」，故默认行为与拆分前一致（候选项继承「选择代理」的动态地区节点列表）。
2. 新增 rule-provider「nodeseek」（`behavior: domain`，`format: yaml`）与 `RULE-SET,nodeseek` 分流规则，置于 `RULE-SET,GFWList` 之前（逐级回退：`GEOIP,cn` / `GEOSITE,cn` → 最终 `MATCH`）。

> ruleset 来源（域名集合：`nodeseek.com`、`nodeseek.org`、`nodeimage.com`、`nodeget.com`、`nodequality.com`、`deepflood.com`、`ilatency.com`、`seek.li`、`22112211.xyz`）：[clash-rulesets/nodeseek.yml](https://clash-rulesets.greenhat616.deno.net/rulesets/nodeseek.yml)。
>
> 图标：主流图标集均无 NodeSeek 图标，故爬取官方 favicon（512px PNG，已确认背景透明）存至本仓库 [`icons/`](icons)，经 jsDelivr 引用。

## 工作原理

`convert.js` 用 `GEOSITE,category-ai-!cn,AI服务` 把全部 AI 服务（含 huggingface）路由到「AI服务」分组。本脚本不改动原逻辑，仅：

- **从实际配置读取**「AI服务」分组的候选项（`convert.js` 的 `defaultProxies`：`选择代理 / 地区节点… / 手动选择 / DIRECT`，地区节点为动态生成，故不写死），并把 `AI服务` 放在候选首位（`select` 默认选中首项），因此**默认行为与拆分前完全一致**，但用户可单独为 HuggingFace 选择地区/落地节点。
- 为 HuggingFace 分组设置**专属图标**（HuggingFace 官方 Logo，SVG 原始素材存于 [`icons/`](icons)，渲染为 PNG 后经 jsDelivr 引用）。
- 把 `GEOSITE,huggingface` 规则插到 `category-ai-!cn` **之前**，保证优先级。与原始脚本一致仅用 GEOSITE，依赖客户端 `geosite.dat` 的 huggingface 分类，不额外引入兜底规则。

脚本**幂等**，重复执行不会产生重复分组或规则。

## 使用方法

支持脚本链式执行的客户端（Clash Verge Rev / Mihomo Party / Sparkle 等）在「全局扩展脚本 / Override」中按顺序添加脚本：

1. `https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js`
2. 本仓库脚本（按需任选）：

```
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/huggingface.min.js
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/tailscale.min.js
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/meta.min.js
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/nodeseek.min.js
```

版本化引用：

```
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts@v1.0.0/huggingface.min.js
```

> 必须保证执行顺序：先 `convert.min.js`，后本仓库脚本。

## 自定义

编辑 `huggingface.js` / `tailscale.js` / `meta.js` / `nodeseek.js` 顶部常量：

| 常量                   | 说明                                                |
| ---------------------- | --------------------------------------------------- |
| `HUGGINGFACE_GROUP`    | 新分组名称（默认 `HuggingFace`）                    |
| `AI_SERVICE_GROUP`     | 对应 `convert.js` 的 AI 分组名（默认 `AI服务`）     |
| `HUGGINGFACE_ICON`     | HuggingFace 分组图标（默认官方 Logo）               |
| `TAILSCALE_GROUP`      | 新分组名称（默认 `Tailscale`）                      |
| `TAILSCALE_ICON`       | Tailscale 分组图标（默认本仓库爬取的官方 Logomark） |
| `META_GROUP`           | 新分组名称（默认 `Meta`）                           |
| `META_ICON`            | Meta 分组图标（默认本仓库爬取的官方 Logomark）      |
| `NODESEEK_GROUP`       | 新分组名称（默认 `NodeSeek`）                       |
| `NODESEEK_PROVIDER`    | rule-provider 名称（默认 `nodeseek`）               |
| `NODESEEK_RULESET_URL` | NodeSeek 域名 ruleset 地址                          |
| `NODESEEK_ICON`        | NodeSeek 分组图标（默认本仓库爬取的官方 favicon）   |
| `GLOBAL_GROUP`         | Nyanpasu 兼容需挂载的分组名（默认 `GLOBAL`）        |
| `SSH_GROUP`            | 分组插入的优先锚点（默认 `SSH`，huggingface 除外）  |
| `FINAL_GROUP`          | 分组插入的兜底锚点（默认 `Final`）                  |

## 开发

```bash
pnpm install
pnpm test            # 无网络冒烟测试
pnpm run build       # 生成 *.min.js
pnpm run build:icons # 将 icons/*.svg 渲染为 512px PNG（resvg）
pnpm run format      # prettier
```

## 发布流程

参考 `override-rules`：推送 `v*` tag 触发 `.github/workflows/release.yml`，自动从 tag 同步版本号、运行测试、构建 `*.min.js`、回提构建产物并创建 GitHub Release。jsDelivr 即可按 `@vX.Y.Z` 引用。

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
