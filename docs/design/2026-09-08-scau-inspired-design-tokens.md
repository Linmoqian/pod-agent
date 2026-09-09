# 华南农业大学官网风格启发的应用设计 Token

| 项目 | 说明 |
| --- | --- |
| 目标读者 | Pod Agent 的产品、UI 与前端开发者 |
| 权威源 | 本 Markdown 文档；实现中的变量应与本文同步 |
| 参考对象 | [华南农业大学官网](https://scau.edu.cn/) |
| 采样时间 | 2026-09-08，桌面视口 `1280 × 720` |
| 适用范围 | Pod Agent 桌面端的视觉语言、布局、组件外观与动效 |
| 排除项 | 官网文案、校名、校徽、摄影、插画、图标、标题字图及其他品牌资产 |

## 1. 设计结论

Pod Agent 应采用“学术可信、农业生命力、克制现代”的视觉语言：大面积白色或极浅绿色承载信息，以森林绿建立品牌识别，以金色作少量提示；通过充足留白、图片或数据焦点、细分隔线和低强度阴影组织高密度内容。

官网的核心视觉规律是：

- 首屏用高质量自然或校园影像建立情绪，导航覆盖在图像上；滚动后导航转为白底、深色文字和轻阴影。
- 主色不是高饱和荧光绿，而是偏灰、偏深的森林绿；背景以白色和近白的米绿色为主。
- 内容区采用宽容器、明显区块间距、非对称主次栏和少量圆角卡片。
- 正文使用无衬线中文字体，日期和关键数字使用衬线字体形成学术感与层级。
- 圆角集中在卡片、按钮和圆形控制器；主体页面保持直线与大块面，避免过度“胶囊化”。

这些规律应被抽象为应用 Token，不直接复制官网结构。Pod Agent 的默认界面应以信息任务为中心；全屏影像只用于欢迎页、空状态或专题页，不进入持续工作的主界面。

## 2. 证据与适配口径

官网样式表以 `html { font-size: 100px; }` 和 `rem` 组织尺寸，根变量包含 `#40814F`、`22px`、`18px`、`16px`、`14px` 与 `1600px` 内容宽度。真实页面还使用 `#327241`、`#007A49`、`#027245`、10px 圆角、低强度阴影和 `0.4s ease-in-out` 过渡。

| 官网观测 | 应用适配 |
| --- | --- |
| `1600px` 宽内容容器，桌面端按视口缩放 | 保留宽屏气质，但采用最大宽度与固定响应式边距，不整体缩放 UI |
| `16/18/22px` 为主要内容字号 | 扩展为完整、可访问的应用字体层级 |
| `50px` 衬线数据数字 | 仅用于仪表盘关键指标和统计摘要 |
| 多处标题由图片表现 | 改为真实文本和字体 Token，保证搜索、缩放与辅助技术可用 |
| 大图、新闻卡片与轮播 | 转译为欢迎页焦点、数据卡片和可选媒体区，不复制新闻门户布局 |
| `0.4s` 过渡 | 保留为强调型动效；常规应用交互缩短到 `160–240ms` |

## 3. 颜色 Token

### 3.1 基础与语义颜色

| Token | 值 | 来源 | 用途 |
| --- | --- | --- | --- |
| `--color-brand-500` | `#40814F` | 官网根变量 | 品牌主色、文本链接、选中状态 |
| `--color-brand-600` | `#327241` | 官网按钮与日期 | 主按钮、悬停态、强调文本 |
| `--color-brand-700` | `#275A33` | 适配派生 | 主按钮按下态 |
| `--color-brand-strong` | `#007A49` | 官网数据区 | 大面积反色区、强品牌背景 |
| `--color-brand-deep` | `#027245` | 官网页脚 | 深色导航、页脚或状态栏 |
| `--color-surface-canvas` | `#FAFCF8` | 官网浅绿渐变终点 | 应用画布背景 |
| `--color-surface-subtle` | `#FAFFF4` | 官网浅绿渐变起点 | 分区、悬浮弱背景 |
| `--color-surface-default` | `#FFFFFF` | 官网内容卡片 | 面板、卡片、输入框 |
| `--color-surface-disabled` | `#F0F4ED` | 官网浅色背景 | 禁用控件、只读区域 |
| `--color-text-primary` | `#333333` | 官网主文本 | 标题、正文 |
| `--color-text-secondary` | `#666666` | 官网次文本 | 辅助说明、元数据 |
| `--color-text-disabled` | `#999999` | 官网弱文本 | 禁用标签、占位信息 |
| `--color-text-inverse` | `#FFFFFF` | 官网反色文本 | 深绿背景上的文字 |
| `--color-border-subtle` | `#E8E8E8` | 官网样式资产 | 分隔线、静止边框 |
| `--color-border-default` | `#D5D5D5` | 官网样式资产 | 输入框、面板边界 |
| `--color-accent-gold` | `#EDC25D` | 官网强调色 | 徽标、图表高亮、提醒，不作白字底色 |
| `--color-accent-teal` | `#3BB4AB` | 官网快捷入口 | 次级分类或图表序列 |
| `--color-accent-red` | `#B93E2E` | 官网快捷入口 | 错误、风险或重要异常 |
| `--color-accent-mint` | `#4FB18D` | 官网快捷入口 | 成功或次级数据序列 |
| `--color-overlay-image` | `rgba(0, 0, 0, 0.40)` | 官网图像渐变抽象 | 图片上文字的可读性遮罩 |
| `--color-focus-ring` | `rgba(64, 129, 79, 0.28)` | 适配派生 | 键盘焦点外环 |

### 3.2 使用约束

- `#40814F`、`#327241`、`#007A49` 和 `#027245` 上的白色文字对比度分别约为 `4.70:1`、`5.80:1`、`5.41:1` 和 `6.01:1`，可用于普通正文；字号小于 16px 时优先使用后三者。
- `#EDC25D`、`#3BB4AB` 和 `#4FB18D` 不使用白色正文。其上使用 `#333333` 时对比度分别约为 `7.51:1`、`5.00:1` 和 `4.82:1`。
- 品牌绿建议不超过单屏实色面积的 20%；大面积绿色区域应减少层级和装饰，避免视觉压迫。
- 金色只表达“稀有、重点、提醒”，不能代替错误色，也不用于长段文字。

## 4. 字体 Token

官网使用定制中文无衬线字体和 `Merriweather` 数字。项目实现不默认复制其字体文件；字体文件的授权、体积和离线分发方式未确认前，使用系统字体栈。

```css
--font-family-sans: system-ui, -apple-system, BlinkMacSystemFont, "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-family-serif-number: "Merriweather", Georgia, "Times New Roman", serif;
```

| Token | 字号 / 行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| `--type-display` | `40px / 1.2` | 700 | 欢迎页主标题；应用主界面慎用 |
| `--type-section` | `30px / 1.4` | 700 | 一级分区标题，来自官网 30px 标题尺度 |
| `--type-title` | `22px / 1.4` | 700 | 面板、页面标题 |
| `--type-subtitle` | `18px / 1.5` | 600 | 卡片标题、强调文本 |
| `--type-body` | `16px / 1.75` | 400 | 正文、表单文本 |
| `--type-reading` | `17px / 1.75` | 400 | 对话正文与长篇 Markdown 阅读 |
| `--type-label` | `14px / 1.4` | 600 | 标签、按钮、导航 |
| `--type-caption` | `12px / 1.5` | 400 | 时间、来源、辅助信息 |
| `--type-metric` | `50px / 1` | 700 | 关键指标；使用衬线数字字体 |

正文默认左对齐。中文长段落行宽控制在 `36–42em`，产品说明最多 `64em`。除数据与日期外不大面积混用衬线字体。

## 5. 间距、尺寸与布局 Token

### 5.1 间距

使用 4px 基准网格，保留官网宽松区块节奏，同时减少原页面为宣传展示设置的超大留白。

| Token | 值 | 建议用途 |
| --- | --- | --- |
| `--space-1` | `4px` | 图标内微调 |
| `--space-2` | `8px` | 紧凑元素间距 |
| `--space-3` | `12px` | 标签、按钮内部间距 |
| `--space-4` | `16px` | 默认组件间距 |
| `--space-5` | `20px` | 表单组、卡片内小分区 |
| `--space-6` | `24px` | 卡片内边距 |
| `--space-8` | `32px` | 面板间距 |
| `--space-10` | `40px` | 页面内分区 |
| `--space-12` | `48px` | 大分区 |
| `--space-16` | `64px` | 页面上下留白 |
| `--space-20` | `80px` | 欢迎页区块 |
| `--space-24` | `96px` | 大屏展示区块上限 |

### 5.2 应用尺寸

| Token | 值 | 用途 |
| --- | --- | --- |
| `--size-control-sm` | `32px` | 紧凑图标按钮 |
| `--size-control-md` | `40px` | 默认输入框与按钮 |
| `--size-control-lg` | `48px` | 主行动按钮 |
| `--size-header` | `72px` | 桌面应用顶栏 |
| `--size-icon-sm` | `16px` | 行内图标 |
| `--size-icon-md` | `20px` | 按钮与导航图标 |
| `--size-icon-lg` | `24px` | 面板操作图标 |
| `--layout-content-max` | `1600px` | 官网宽内容容器的保留值 |
| `--layout-reading-max` | `960px` | 文档、对话和表单主体 |
| `--layout-sidebar` | `320px` | 桌面侧栏基准宽度 |
| `--layout-gutter` | `clamp(20px, 4vw, 60px)` | 页面水平边距 |

推荐桌面工作区使用 `minmax(0, 1fr) 320px` 主次栏；侧栏约占 20%–25%，呼应官网 `71.375% / 24.8%` 的主次关系。双列表或双面板使用 `1fr 1fr`，中间间距至少 32px。

## 6. 圆角、边框与阴影 Token

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-full: 9999px;

--border-subtle: 1px solid var(--color-border-subtle);
--border-default: 1px solid var(--color-border-default);

--shadow-card: 0 3px 20px rgba(0, 0, 0, 0.08);
--shadow-media: 0 3px 20px rgba(0, 0, 0, 0.16);
--shadow-header: 0 5px 10px rgba(0, 0, 0, 0.10);
--shadow-elevated: 0 24px 72px rgba(21, 48, 28, 0.18);
```

- 默认卡片使用 `--radius-md`；圆形头像、轮播点和图标控制器才使用 `--radius-full`。
- 普通信息卡优先使用边框或 `--shadow-card` 二选一，不叠加。
- `--shadow-media` 只用于浮在卡片外的图片；弹层使用 `--shadow-elevated`。
- 导航、顶栏和侧栏同层级不叠加阴影，以材料表面色、细边界和模糊建立层级。

## 7. 动效 Token

| Token | 值 | 用途 |
| --- | --- | --- |
| `--duration-press` | `100ms` | 按下时的即时缩放反馈 |
| `--duration-fast` | `160ms` | 悬停、颜色、图标反馈 |
| `--duration-normal` | `240ms` | 折叠、面板切换 |
| `--duration-expressive` | `400ms` | 官网式导航展开、图片过渡 |
| `--easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 常规进入与状态变化 |
| `--easing-emphasized` | `ease-in-out` | 强调型过渡 |

按钮按下使用 `scale(0.97)`，不等待涟漪或颜色动画；面板与会话切换采用可中断弹簧和连续交叉过渡。动画优先使用 `transform`、`opacity` 等合成属性。媒体卡悬停可使用 `transform: scale(1.03)`；官网的 `1.05` 仅保留给大幅欢迎页媒体。遵循 `prefers-reduced-motion: reduce`，关闭非必要缩放和自动轮播。

### 7.1 材料与辅助功能

- 半透明材料只使用农业表面色混合，不引入 Apple 蓝或装饰渐变。
- `--material-rail`、`--material-toolbar` 与 `--material-modal` 分别用于导航、工具栏和弹窗；模糊只用于表达层级。
- `prefers-reduced-transparency: reduce` 时退化为不透明表面；`prefers-contrast: more` 时同时强化边界。

## 8. 响应式 Token

官网样式在 `1900`、`1820`、`1600`、`1280`、`999`、`767`、`640` 和 `479px` 设置断点。应用端合并为更少、更稳定的四档：

| Token | 断点 | 行为 |
| --- | --- | --- |
| `--breakpoint-wide` | `1600px` | 内容停止扩张；增加两侧留白 |
| `--breakpoint-desktop` | `1280px` | 主次栏保持，侧栏可缩至 280px |
| `--breakpoint-tablet` | `1000px` | 双栏转单栏，次要导航折叠 |
| `--breakpoint-mobile` | `768px` | 页面边距 20px，卡片满宽，顶栏压缩至 56px |
| `--breakpoint-small` | `480px` | 次要元数据换行，主按钮可满宽 |

不要像官网一样通过动态改变根字号整体缩放应用；文字、控件和点击区域应保持稳定的可读尺寸。

## 9. 组件配方

### 9.1 顶栏

- 默认工作界面：使用 `--material-toolbar`、`--color-text-primary` 和细边界，高度 72px；不叠加多重阴影。
- 欢迎或专题页面：可透明覆盖在媒体上，文字与图标改为白色；离开媒体区后必须切换为默认工作界面样式。
- 当前导航项使用品牌绿文字和 2px 底部指示线，不用大面积实色胶囊。

### 9.2 主按钮

```css
.button-primary {
  min-height: var(--size-control-md);
  padding-inline: var(--space-5);
  color: var(--color-text-inverse);
  background: var(--color-brand-600);
  border: 0;
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) var(--easing-standard);
}

.button-primary:hover { background: var(--color-brand-500); }
.button-primary:active { background: var(--color-brand-700); }
.button-primary:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px; }
```

### 9.3 信息卡片

- 白底、24px 内边距、10px 圆角。
- 同层级信息使用浅边框；需要突出时改用 `--shadow-card`。
- 标题与正文间距 12px，正文与行动区间距 20px。
- 媒体卡在图片底部叠加渐变遮罩；文字必须位于对比度足够的区域。

### 9.4 数据摘要

- 使用 `--color-brand-strong` 背景、白色文本和衬线数字。
- 每项数据至少 160px 宽；数字为视觉焦点，标签使用 14–16px 无衬线字体。
- 不依赖颜色表达增减，同时配合箭头、正负号或文字。

### 9.5 输入与状态

- 输入框高度 40px，白底、1px 默认边框、10px 圆角。
- 聚焦时边框使用 `--color-brand-500`，外环使用 `--color-focus-ring`。
- 禁用状态降低对比度但仍保留边界；错误状态使用 `--color-accent-red`，并显示可读错误文本。

## 10. 可直接采用的 CSS 变量

```css
:root {
  --color-brand-500: #40814f;
  --color-brand-600: #327241;
  --color-brand-700: #275a33;
  --color-brand-strong: #007a49;
  --color-brand-deep: #027245;
  --color-surface-canvas: #fafcf8;
  --color-surface-subtle: #fafff4;
  --color-surface-default: #ffffff;
  --color-surface-disabled: #f0f4ed;
  --color-text-primary: #333333;
  --color-text-secondary: #666666;
  --color-text-disabled: #999999;
  --color-text-inverse: #ffffff;
  --color-border-subtle: #e8e8e8;
  --color-border-default: #d5d5d5;
  --color-accent-gold: #edc25d;
  --color-accent-teal: #3bb4ab;
  --color-accent-red: #b93e2e;
  --color-accent-mint: #4fb18d;
  --color-state-success: var(--color-brand-500);
  --color-state-warning: var(--color-accent-gold);
  --color-state-danger: var(--color-accent-red);
  --color-state-info: var(--color-accent-teal);
  --color-overlay-image: rgba(0, 0, 0, 0.4);
  --color-focus-ring: rgba(64, 129, 79, 0.28);

  --font-family-sans: system-ui, -apple-system, BlinkMacSystemFont, "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-family-serif-number: "Merriweather", Georgia, "Times New Roman", serif;
  --font-size-display: 40px;
  --font-size-section: 30px;
  --font-size-title: 22px;
  --font-size-subtitle: 18px;
  --font-size-body: 16px;
  --font-size-reading: 17px;
  --font-size-label: 14px;
  --font-size-caption: 12px;
  --font-size-metric: 50px;
  --line-height-tight: 1.2;
  --line-height-title: 1.4;
  --line-height-body: 1.75;
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --letter-spacing-display: -0.025em;
  --letter-spacing-title: -0.015em;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  --size-control-sm: 32px;
  --size-control-md: 40px;
  --size-control-lg: 48px;
  --size-header: 72px;
  --size-icon-sm: 16px;
  --size-icon-md: 20px;
  --size-icon-lg: 24px;
  --layout-content-max: 1600px;
  --layout-reading-max: 960px;
  --layout-sidebar: 320px;
  --layout-gutter: clamp(20px, 4vw, 60px);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;
  --border-subtle: 1px solid var(--color-border-subtle);
  --border-default: 1px solid var(--color-border-default);
  --shadow-card: 0 3px 20px rgba(0, 0, 0, 0.08);
  --shadow-media: 0 3px 20px rgba(0, 0, 0, 0.16);
  --shadow-header: 0 5px 10px rgba(0, 0, 0, 0.1);
  --shadow-elevated: 0 24px 72px rgba(21, 48, 28, 0.18);

  --material-rail: color-mix(in srgb, var(--color-surface-default) 82%, transparent);
  --material-toolbar: color-mix(in srgb, var(--color-surface-default) 88%, transparent);
  --material-modal: color-mix(in srgb, var(--color-surface-default) 94%, transparent);
  --material-scrim: rgba(15, 25, 18, 0.34);
  --material-highlight: color-mix(in srgb, var(--color-surface-default) 72%, transparent);
  --blur-chrome: 20px;
  --blur-modal: 32px;

  --duration-fast: 160ms;
  --duration-press: 100ms;
  --duration-normal: 240ms;
  --duration-expressive: 400ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --easing-emphasized: ease-in-out;
  --press-scale: 0.97;

  --code-comment: #8a917f;
  --code-keyword: #275a33;
  --code-string: #1e7d76;
  --code-number: #9a6b1f;
  --code-title: #327241;
}
```

## 11. 验收清单

- 页面主要颜色只来自本文语义 Token，没有散落的相近绿色。
- 正文默认达到 WCAG AA 对比度，键盘焦点始终可见。
- 主界面不使用全屏轮播；媒体不会遮蔽任务信息。
- 卡片圆角以 10px 为主，阴影保持低强度且不与边框叠加。
- 数字衬线字体只用于关键指标；正文和控件统一使用中文无衬线字体栈。
- 在 1600、1280、1000、768 和 480px 附近检查布局，无根字号整体缩放。
- 未复制官网的校徽、照片、插画、标题字图、图标或字体文件。

## 12. 暗色主题与代码语法色

应用支持明暗双主题。切换机制：`SettingsProvider` 将解析后的主题写入
`<html data-theme="...">`，`tokens.css` 以 `[data-theme="dark"]` 整体覆盖颜色类
变量；尺寸、字体与动效 Token 不随主题变化。antd 侧由根组件读取同一状态，
在 `defaultAlgorithm` 与 `darkAlgorithm` 间切换，并套用下文色板。

派生原则：

- 表面变为带绿调的墨色，亮度关系与亮色一致(画布最暗、卡片最亮)。
- 品牌绿整体提亮保持暗底可读；亮色中 hover 变浅、按压变深的反馈方向，
  暗色下统一朝提亮方向走。
- 大面积反色区(`brand-strong`/`brand-deep`)保持中等深度以维持白字对比。

### 12.1 暗色变量集

| Token | 暗色值 | 说明 |
| --- | --- | --- |
| `--color-brand-500` | `#6aa877` | 悬停、链接、选中指示(暗底对比 ≈ 6.0:1) |
| `--color-brand-600` | `#5b9e6b` | 强调文字、选中标题(暗底对比 ≈ 5.3:1) |
| `--color-brand-700` | `#7cb989` | 按压反馈，向亮处走 |
| `--color-brand-strong` | `#0e8f5c` | 反色区，白字大号文本可用 |
| `--color-brand-deep` | `#0d7a4e` | 深色状态区 |
| `--color-surface-canvas` | `#101613` | 应用画布 |
| `--color-surface-subtle` | `#141b16` | 侧栏、代码块底 |
| `--color-surface-default` | `#1a231d` | 卡片、面板 |
| `--color-surface-disabled` | `#202a23` | 禁用、只读区 |
| `--color-text-primary` | `#e8ece7` | 主文本 |
| `--color-text-secondary` | `#aab4ab` | 次文本 |
| `--color-text-disabled` | `#7a837b` | 弱文本 |
| `--color-text-inverse` | `#ffffff` | 品牌绿底上的文字 |
| `--color-border-subtle` | `#2a332c` | 分隔线 |
| `--color-border-default` | `#3a443c` | 输入框、面板边界 |
| `--color-accent-gold` | `#f0cd77` | 提醒、代码数字 |
| `--color-accent-teal` | `#55c2b8` | 次级分类 |
| `--color-accent-red` | `#d9705f` | 错误、风险 |
| `--color-accent-mint` | `#63c29e` | 成功、就绪 |
| `--color-focus-ring` | `rgba(106, 168, 119, 0.4)` | 键盘焦点外环 |
| `--shadow-card` | `0 3px 20px rgba(0, 0, 0, 0.32)` | 卡片阴影加深 |
| `--shadow-media` | `0 3px 20px rgba(0, 0, 0, 0.5)` | 弹层阴影 |
| `--shadow-header` | `0 5px 10px rgba(0, 0, 0, 0.35)` | 顶栏阴影 |
| `--shadow-elevated` | `0 24px 72px rgba(0, 0, 0, 0.55)` | 高层级弹窗阴影 |
| `--material-scrim` | `rgba(0, 0, 0, 0.56)` | 暗色弹窗遮罩 |

### 12.2 antd 明暗色板

antd 组件颜色不读 CSS 变量，由根组件按主题切换算法并套用色板；色值与上表一致，
仅两处独立取舍：暗色 `colorPrimary` 取 `#3f8456`(白字对比 ≈ 4.5:1，按钮文字
可读)，链接色 `colorLink` 单独取 `#6aa877`(暗底正文可读)。亮色色板见第 3 节。

### 12.3 代码语法色

Markdown 代码块高亮不引入 highlight.js 官方浅色主题，改用跟随主题的语法色
Token，明暗各一套，映射参考 GitHub 低饱和配色：

| Token | 亮色 | 暗色 | 用途 |
| --- | --- | --- | --- |
| `--code-comment` | `#8a917f` | `#7a837b` | 注释、元信息 |
| `--code-keyword` | `#275a33` | `#7cb989` | 关键字、属性、内建 |
| `--code-string` | `#1e7d76` | `#63c2b8` | 字符串、正则 |
| `--code-number` | `#9a6b1f` | `#f0cd77` | 数字、字面量 |
| `--code-title` | `#327241` | `#5b9e6b` | 函数名、标题、选择器 |

## 13. 来源与限制

本设计 Token 依据 2026-09-08 对官网首页的视觉观察、计算样式和以下官方样式资产提炼：

- [华南农业大学官网首页](https://scau.edu.cn/)
- [首页主样式表](https://scau.edu.cn/_upload/tpl/06/94/1684/template1684/style.css)
- [首页响应式样式表](https://scau.edu.cn/_upload/tpl/06/94/1684/template1684/media.css)

官网可能后续改版。本文记录的是该日期下的设计语言快照，而非华南农业大学官方品牌规范；项目上线前仍需进行实际页面的可用性、无障碍和品牌合规评审。
