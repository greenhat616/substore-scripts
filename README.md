# substore-scripts · HuggingFace 独立分组

Mihomo / Clash 全局覆写「**后处理脚本**」。在 [`powerfullz/override-rules`](https://github.com/powerfullz/override-rules) 的 `convert.js` **之后**链式执行，在其生成的配置基础上做最小改造：

1. 新增 **「HuggingFace」** proxy group（`type: select`），**默认选中「AI服务」**。
2. 新增 `GEOSITE,huggingface` 分流规则，置于 `GEOSITE,category-ai-!cn` 之前，使 HuggingFace 流量优先命中独立分组。

> geosite 分类来源：[v2fly/domain-list-community · `data/huggingface`](https://github.com/v2fly/domain-list-community/blob/master/data/huggingface) —— `hf.co`、`hf.space`、`huggingface.co`，已编入主流 `geosite.dat` 的 `huggingface` 分类。

## 工作原理

`convert.js` 用 `GEOSITE,category-ai-!cn,AI服务` 把全部 AI 服务（含 huggingface）路由到「AI服务」分组。本脚本不改动原逻辑，仅：

- **从实际配置读取**「AI服务」分组的候选项（`convert.js` 的 `defaultProxies`：`选择代理 / 地区节点… / 手动选择 / DIRECT`，地区节点为动态生成，故不写死），并把 `AI服务` 放在候选首位（`select` 默认选中首项），因此**默认行为与拆分前完全一致**，但用户可单独为 HuggingFace 选择地区/落地节点。
- 为 HuggingFace 分组设置**专属图标**（HuggingFace 官方 Logo）。
- 把 `GEOSITE,huggingface` 规则插到 `category-ai-!cn` **之前**，保证优先级。与原始脚本一致仅用 GEOSITE，依赖客户端 `geosite.dat` 的 huggingface 分类，不额外引入兜底规则。

脚本**幂等**，重复执行不会产生重复分组或规则。

## 使用方法

支持脚本链式执行的客户端（Clash Verge Rev / Mihomo Party / Sparkle 等）在「全局扩展脚本 / Override」中按顺序添加两个脚本：

1. `https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js`
2. 本脚本：

```
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts/huggingface.min.js
```

版本化引用：

```
https://cdn.jsdelivr.net/gh/greenhat616/substore-scripts@v1.0.0/huggingface.min.js
```

> 必须保证执行顺序：先 `convert.min.js`，后 `huggingface.min.js`。

## 自定义

编辑 `huggingface.js` 顶部常量：

| 常量                | 说明                                            |
| ------------------- | ----------------------------------------------- |
| `HUGGINGFACE_GROUP` | 新分组名称（默认 `HuggingFace`）                |
| `AI_SERVICE_GROUP`  | 对应 `convert.js` 的 AI 分组名（默认 `AI服务`） |
| `HUGGINGFACE_ICON`  | HuggingFace 分组图标（默认官方 Logo）           |

## 开发

```bash
pnpm install
pnpm test        # 无网络冒烟测试
pnpm run build   # 生成 huggingface.min.js
pnpm run format  # prettier
```

## 发布流程

参考 `override-rules`：推送 `v*` tag 触发 `.github/workflows/release.yml`，自动从 tag 同步版本号、运行测试、构建 `huggingface.min.js`、回提构建产物并创建 GitHub Release。jsDelivr 即可按 `@vX.Y.Z` 引用。

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
