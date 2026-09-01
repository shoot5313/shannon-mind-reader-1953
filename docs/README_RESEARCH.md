# 高 Star README 写法调研：香农读心机

核对日期：2026-08-31。范围限定为 6 个官方 GitHub 仓库；Star 是 GitHub REST API 的查询快照，会继续变化。结构判断只依据仓库当前 README 与仓库所链接的官方试玩页，没有采用榜单文章或第三方点评。高 Star 只能说明这些写法经受了大量访问，不能证明 README 本身导致了 Star。

> **2026-09-01 注记。** 本文写于 1.0.1，文中提到的「150 手」是当时的航程长度。1.1.0 已改为 100 海里 / 热身 10 手 / 第 80 海里起风暴，并新增出手前的探照灯读数与结算时的习惯检验。这里保留原始数字，因为本文记录的是当时的调研结论，不是规则说明；结构建议本身与手数无关，仍然成立。当前规则以 [README](../README.md) 和 [PROTOTYPE_NOTES 第七轮](../PROTOTYPE_NOTES.md) 为准。

## 先说结论

[当前 README](../README.md) 的真正长处是有一句好钩子、故事可信、机制讲得诚实，也把“无登录、无 AI API、数据不上云”说清楚了。主要问题不在内容不够，而在第一屏排序：读者先经历较长的历史叙述，之后才看到试玩入口；同时缺少一张能立刻说明“这是什么体验”的真实画面。

6 个案例最稳定的共性不是统一模板，而是**先让人理解并相信产品，再谈实现**：

- 5 个可在线体验的项目全部在安装/构建说明之前给出试玩入口；其中 Sandspiel、Trust、WebGL Fluid、React Tetris、Excalidraw 都在开头附近用截图、GIF 或可点击封面提供视觉证据。
- 开场通常只完成三件事：一句话说清价值、给出真实画面、给出一个主动作。历史、算法、构建、贡献和许可证随后分层展开。
- 好 README 可以极短（WebGL Fluid），也可以很长（React Tetris、bat）。决定第一印象的不是总长度，而是前 20 秒能否回答“是什么、看起来怎样、现在能不能试”。
- 技术信息并非越少越好。与产品可信度直接相关的技术事实可以提前；命令、架构、开发细节应后置。对本项目而言，“不是大模型、机器先押注、本地计算”属于用户信任信息，应该早于代码地图，但晚于试玩主动作。

## 六个案例

### 1. Sandspiel — 3,160 Star（约 3.2k）

- 开场：一句带画面的引用，紧接真实截图；随后用一句话定义它是 Rust/Wasm、WebGL 驱动的 falling-sand 浏览器游戏。
- 结构：引用 → 截图 → 一句话定义 → [在线玩](https://sandspiel.club/) / 长文 → 项目目标 → Build。
- 技术后置：只在产品定义里点出技术栈，完整构建命令放到最后。
- 对本项目最值得借：**氛围句 + 真实画面 + 试玩 + 一段设计意图**，和香农读心机的“历史器物变成浏览器游戏”很贴合。
- 不宜照搬：开头引用来自别的 falling-sand 游戏，独立识别度稍弱；本项目已有更好的原创钩子。
- 来源：[官方 README](https://github.com/MaxBittker/sandspiel/blob/master/README.md) · [GitHub API / Star](https://api.github.com/repos/MaxBittker/sandspiel) · [官方试玩](https://sandspiel.club/)

### 2. The Evolution of Trust — 6,276 Star（约 6.3k）

- 开场：先放横幅图，下一行就是醒目的 “PLAY IT HERE”。几乎不要求读者先理解博弈论。
- 结构：封面 → [立即试玩](https://ncase.me/trust/) → 素材致谢 → 翻译流程 → 许可。
- 技术后置：它干脆不讲实现，把仓库 README 当成作品入口和协作说明。
- 对本项目最值得借：**把体验置于解释之前**；同为“通过互动理解一个科学思想”，这是最接近的注意力顺序。
- 不宜照搬：README 几乎没有解释互动机制。香农读心机需要保留简短的“它如何记忆、为何不是 AI”来建立可验证性，也不必使用全大写 CTA。
- 来源：[官方 README](https://github.com/ncase/trust/blob/gh-pages/README.md) · [GitHub API / Star](https://api.github.com/repos/ncase/trust) · [官方试玩](https://ncase.me/trust/)

### 3. WebGL Fluid Simulation — 16,601 Star（约 16.6k）

- 开场：标题下面立刻是 [Play here](https://paveldogreat.github.io/WebGL-Fluid-Simulation/)，再接一张 880px 宽截图。
- 结构：标题 → 试玩 → 截图 → 技术参考 → License；整个 README 极短。
- 技术后置：不解释实现，只给研究/实现参考链接。
- 对本项目最值得借：试玩入口与主视觉可以压缩成一个极强的首屏，不需要用多段文字证明“值得玩”。
- 不宜照搬：这种极简适合无需说明规则的流体玩具；本项目有 1953 年来源、八格记忆与公平承诺，过度删减会损害可信度。
- 来源：[官方 README](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/README.md) · [GitHub API / Star](https://api.github.com/repos/PavelDoGreat/WebGL-Fluid-Simulation) · [官方试玩](https://paveldogreat.github.io/WebGL-Fluid-Simulation/)

### 4. React Tetris — 8,732 Star（约 8.7k）

- 开场：一句项目动机后立即邀请读者试玩，随后连续用 GIF 证明正常速度、移动端操作和断点续玩。
- 结构：动机 → [试玩](https://chvin.github.io/react-tetris/?lan=en) → 多组功能 GIF → React/Redux/Immutable 技术文章 → 体验优化 → 开发命令（最末）。
- 技术后置：先展示玩家可感知的结果，再解释状态、音频、事件处理；安装和运行被放到末尾。
- 对本项目最值得借：用一张短 GIF 同时证明“机器先押、玩家再选、即时反馈”，比一段规则说明更快；功能图应各自配一句可验证的结论。
- 不宜照搬：技术教程占比过大，读者会在中段失去主线。本项目的 README 不应展开成 JavaScript 或算法教材。
- 来源：[官方 README](https://github.com/chvin/react-tetris/blob/master/README.md) · [英文 README](https://github.com/chvin/react-tetris/blob/master/README-EN.md) · [GitHub API / Star](https://api.github.com/repos/chvin/react-tetris) · [官方试玩](https://chvin.github.io/react-tetris/?lan=en)

### 5. Excalidraw — 130,859 Star（约 130.9k）

- 开场：整张品牌封面可点击进入产品；接着是 Editor/Blog/Docs 导航、两行价值主张、徽章和第二张产品展示图。
- 结构：可点击 Hero → 一句话定位 → 产品截图 → Features → 官网版本的额外能力 → Quick start → 贡献/集成/赞助。
- 技术后置：安装包命令在产品价值与功能清单之后，开发仓库另指向专门文档。
- 对本项目最值得借：让**主视觉本身就是试玩入口**；一句定位同时回答用途和差异点。可将“1953 年八格机器的浏览器复刻”压缩成这样的副标题。
- 不宜照搬：徽章墙、社区导航、集成与赞助区服务于大型生态，小型单页游戏照搬会显得拥挤和企业化。
- 来源：[官方 README](https://github.com/excalidraw/excalidraw/blob/master/README.md) · [GitHub API / Star](https://api.github.com/repos/excalidraw/excalidraw) · [官方应用](https://excalidraw.com/)

### 6. bat — 60,316 Star（约 60.3k；通用项目标杆）

- 开场：Logo、徽章和一句极精确定位：“cat(1) clone with syntax highlighting and Git integration”；随后给出 README 内导航。
- 结构：一句定位 → 关键功能逐项截图 → 最小用法 → 与其他工具集成 → 安装 → 定制 → 开发/贡献/目标。
- 技术后置：先用三个“能力 + 截图”证明差异，安装矩阵和深度配置都在后面；长文靠导航维持可扫读性。
- 对本项目最值得借：每个画面只证明一个卖点，以及把长 README 做成清晰的信息层级。
- 不宜照搬：香农读心机只有一种最优主动作，不需要顶部目录、徽章阵列或跨平台安装大全。
- 来源：[官方 README](https://github.com/sharkdp/bat/blob/master/README.md) · [GitHub API / Star](https://api.github.com/repos/sharkdp/bat)

## 建议给“香农读心机”的信息顺序

这不是成稿，只是由上述案例归纳出的重排骨架。下面第 7、9 条里的「150 手」是 2026-08-31 当时的航程长度，见开头注记：

1. `# 香农读心机`
2. 保留现有钩子：“机器已经先押好了。轮到你骗它。”
3. 一张可点击的真实游戏截图或 5–10 秒 GIF，链接到在线游戏。
4. 单一主 CTA：**现在就玩**。
5. 一句身份说明：这是 Claude Shannon 1953 年八格预测机器的浏览器复刻，不是大语言模型。
6. 一行信任信息：无需登录 · 无 AI API · 本地计算 · 押注发生在点击之前。
7. “怎么玩”：先讲 150 手的主循环，再讲两种模式；避免首屏同时出现全部称号和隐藏档案细节。
8. “机器记住什么”：保留当前最清楚的八格机制与公平性说明。
9. 历史来源与实现边界：1953 原文、Hagelbarger、为什么采用 150 手。
10. 本地运行、测试、代码地图、License。

## 明确不要照搬的模式

- 不要把“高 Star 项目常有很多徽章”误当成成功公式；本项目当前最缺的是体验证据，不是状态徽章。
- 不要像 WebGL Fluid 那样删到只剩链接和截图；科学出处与可核验机制正是本项目的差异点。
- 不要像 React Tetris 那样把 README 写成框架教程；算法细节只需解释到玩家能够判断机器是否作弊。
- 不要像 Trust 那样只做入口页；香农机器的“先押后选”和八格记忆必须在试玩之后尽快说清。
- 不要同时设置多个同权 CTA。首屏只引导试玩；源码、论文、本地运行均可后置。

一句话归纳：**保留现在 README 的灵魂，把“试玩 + 真实画面 + 一句身份”提到故事之前，再把故事压成通往机制与史料的桥。**
