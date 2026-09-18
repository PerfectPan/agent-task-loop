---
name: Rivus room-web
description: 宣纸：一张暖白的纸，正文是思源宋体、界面词是 Inter；左右两栏只比纸面稍暗，靠一根发丝线分开；圆头像、柔和药丸、提及是胶囊。词表用 shadcn 标准 token，配色是宣纸。
colors:
  background: "#ffffff"
  foreground: "#37352f"
  card: "#ffffff"
  card-foreground: "#37352f"
  popover: "#ffffff"
  popover-foreground: "#37352f"
  primary: "#1a6fd1"
  primary-foreground: "#ffffff"
  secondary: "#f7f7f5"
  secondary-foreground: "#37352f"
  muted: "#f7f7f5"
  muted-foreground: "#676664"
  accent: "#efefec"
  accent-foreground: "#37352f"
  destructive: "#b0322d"
  destructive-foreground: "#ffffff"
  border: "#e9e9e7"
  input: "#dedddb"
  ring: "#1a6fd1"
  chart-1: "#6940a5"
  chart-2: "#a25207"
  chart-3: "#3a7351"
  chart-4: "#ac3e79"
  chart-5: "#636e0f"
  sidebar: "#f7f7f5"
  sidebar-foreground: "#37352f"
  sidebar-primary: "#1a6fd1"
  sidebar-primary-foreground: "#ffffff"
  sidebar-accent: "#ebebe8"
  sidebar-accent-foreground: "#37352f"
  sidebar-border: "#e9e9e7"
  sidebar-ring: "#1a6fd1"
  info: "#e7f3f8"
  info-foreground: "#2b6c92"
  warning: "#fbeedc"
  warning-foreground: "#8a5a10"
  success: "#ebf6f1"
  success-foreground: "#3d7a56"
  destructive-soft: "#fbe4e4"
  destructive-soft-foreground: "#b0322d"
typography:
  headline:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Noto Serif SC, Songti SC, STSong, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  name:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
  secondary:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  pill:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  meta:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  mark:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
  mark-sm:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
  chip:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  chip-mark:
    fontFamily: "Inter, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, sans-serif"
    fontSize: "8px"
    fontWeight: 600
    lineHeight: 1
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.25
    fontVariation: "tabular-nums"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "14": "14px"
  "22": "22px"
  "28": "28px"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 12px"
  button-default-hover:
    backgroundColor: "{colors.primary}"
    opacity: 0.9
  button-outline:
    backgroundColor: "transparent"
    borderColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 12px"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 12px"
  button-ghost-xs:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "24px"
    padding: "0 6px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.sm}"
    height: "24px"
    padding: "0 10px"
  input:
    backgroundColor: "transparent"
    borderColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "30px"
    padding: "0 8px"
  badge-muted:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.info-foreground}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-foreground}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.success-foreground}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-destructive-soft:
    backgroundColor: "{colors.destructive-soft}"
    textColor: "{colors.destructive-soft-foreground}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  state-pill:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-foreground}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.sidebar-foreground}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 8px"
  nav-link-current:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
  avatar:
    backgroundColor: "color-mix(in srgb, {colors.chart-1} 15%, transparent)"
    textColor: "{colors.chart-1}"
    rounded: "{rounded.full}"
    size: "30px"
  avatar-human:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.full}"
    size: "30px"
  composer-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.input}"
    rounded: "{rounded.xl}"
    padding: "14px 14px 10px"
  composer-send:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    size: "32px"
  mention-chip:
    backgroundColor: "color-mix(in srgb, {colors.chart-3} 15%, transparent)"
    textColor: "{colors.chart-3}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  dropdown-menu:
    backgroundColor: "{colors.popover}"
    borderColor: "{colors.input}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.lg}"
    padding: "4px"
  sheet:
    backgroundColor: "{colors.sidebar}"
    borderColor: "{colors.input}"
    textColor: "{colors.sidebar-foreground}"
    width: "min(320px, 100%)"
  count-off-block:
    backgroundColor: "{colors.sidebar-accent}"
    rounded: "{rounded.lg}"
    padding: "10px"
---

# Design System: Rivus room-web

本文件由已上线的代码反推得出，不是设计意图的记录。Token 的唯一来源是 `app/styles/global.css`，组件来自 `app/components/ui/*`（shadcn new-york，`components.json` 记录了配置），状态与文案的映射在 `agent-status.ts` 和 `round.ts`。前置 YAML 里的值是规范值（亮色主题）；正文只解释它们放在哪、为什么。

## Overview

**Creative North Star: 「宣纸」（warm white paper），写成 shadcn 的词表**

一张暖白的纸，文字是主体。左栏（房间导航）和右栏（成员与连接）是 `sidebar`——只比纸面暗一档的暖灰，靠一根 1px 的 `sidebar-border` 和中间的纸分开；中间的对话流就是 `background` 本身。整个界面没有一块实色大面，没有堆叠的阴影，唯一浮起来的物件是输入框那张 `card`。工具栏几乎没有存在感：导航项、房间项、文字动作都只是文字，选中和悬停靠一层 `accent`，不靠色块。

它拒绝三种默认：深色霓虹终端、米色纸底加吉祥物加圆角泡泡的聊天应用、以及后台面板那种把一切塞进 13px 的密度。字大、行距松——消息正文 16px / 1.65，量到 66ch；房间标题 24px / 700。

正文是**思源宋体**，界面词是 **Inter**：长段落读起来像文章，标签和按钮仍然是界面。输入框是一个 Tiptap 编辑器，提及在里面是一枚胶囊——一个可以整体删除的物件，而不是九个可以删一半的字符。

**上一轮换的是词表和组件，不是画面。** 上一轮自造的 `--canvas / --side / --stream / --raised / --ink-N / --sel / --run / --held / --err / --done / --id-N` 全部删除，换成 shadcn 的标准 token；控件从手写的 class 集群换成 `~/components/ui/*` 里的 shadcn 组件。颜色值没有重新设计，是同一批宣纸的值搬到了标准名字上。

### 三个需要知道的映射

- **`--chart-1…5` 是五位成员的身份色**，按就座顺序：claude-relay / claude / codex / opencode / dsh。它既是作者名的字色，也是圆头像里两个字母的颜色，头像底是同色 15%（`bg-chart-N/15`）。用 shadcn 自己的分类色阶承担身份，而不是再造一组 `--id-*`。
- **`--accent` 是悬停与选中底**（`#efefec` / `#2a2a2a`）。它是上一轮那层 8% 墨的实色等价物：`rgb(55 53 47 / 0.08)` 压在白纸上算出来是 `#efefef`，所以换成实色后画面不变。栏里用 `sidebar-accent`（`#ebebe8`），同理对应 8% 墨压在 `#f7f7f5` 上。
- **`--info` / `--warning` / `--success` / `--destructive-soft` 是补出来的四对**，沿用 shadcn 自己的配对写法：token 是洗底，`-foreground` 是落在它上面的墨。一枚状态药丸就是 `bg-warning text-warning-foreground`，一个变体名就交代完外观。`--destructive` 保持 shadcn 的原意——实色红，配白字，用在「确认清空」上；柔和的错误洗底另开 `--destructive-soft`，两者不混。

**Key Characteristics:**
- 纸（`background`）与两侧的暖灰（`sidebar`）靠一根发丝线分开，不靠色块，也不靠色相。
- 唯一浮起的物件是输入卡片；菜单、抽屉、新消息胶囊共用同一个 `shadow-card`，没有第二个阴影值。
- 一个强调色（`primary`）管交互，四对状态色以药丸形态管「现在怎么了」，五个 `chart-*` 只管头像与作者名。
- 头像是 shadcn 的 `Avatar`：`bg-chart-N/15` 的淡染底 + 两个大写字母，字母在自己的底上清 4.5:1。
- 状态是印出来的记号：空心 = 排队中，实心 = 已回复，亮色实心 + 计时 = 生成中。
- 界面上没有后端不存在的动作：没有「停下这一轮」，没有对失败成员的单独重试。

## Colors

### 表面

四层表面，亮色下三层都是白，靠 `sidebar` 一档暖灰和一根线分出结构：

| token | 亮 / 暗 | 用在 |
| --- | --- | --- |
| `background` | `#ffffff` / `#191919` | body、对话流、创建页与错误页、智能体页 |
| `card` | `#ffffff` / `#252525` | 输入卡片、新建房间表单、智能体页的卡片 |
| `popover` | `#ffffff` / `#252525` | 房间菜单、提及菜单、跳转链接、草稿预览 |
| `sidebar` | `#f7f7f5` / `#202020` | 左栏、右栏、≤1180 的成员抽屉 |
| `muted` | `#f7f7f5` / `#202020` | 与 `secondary` 同值；`/board` 与 `/task` 的卡片底 |
| `accent` | `#efefec` / `#2a2a2a` | 中栏的悬停与选中底 |
| `sidebar-accent` | `#ebebe8` / `#2a2a2a` | 栏里的悬停、当前项、报数记录块 |

两档发丝线：`border` 画栏与栏之间和同栏内部的分隔，`input` 画控件边和卡片边。`sidebar-border` 与 `border` 同值，分开定义是为了让栏可以单独调。

切换靠根节点上的 `dark` class（shadcn 的惯例）。左栏页脚的「主题：…」三态按钮写 `localStorage['rivus-theme']`；`跟随系统` 时由 JS 解析 `matchMedia('(prefers-color-scheme: dark)')` 并监听变化，`root.tsx` 头部的内联脚本在首屏前把结果盖到 `<html>` 上。CSS 里没有 `prefers-color-scheme` 媒体查询。

### 文字

- **`foreground`**（`#37352f` / `#d4d4d4`）：标题、消息正文、成员 id、输入内容、人的头像底。
- **`foreground/75`**：副标题、说明段、次要按钮文字、导航项静止态。它替代上一轮的 `--ink-2`；不另开 token，因为 shadcn 词表里没有中间灰这一档，而半透明在任何表面上都成立。最差 5.07 / 5.22。
- **`muted-foreground`**（`#676664` / `#9e9e9e`）：节标签、时间戳、元信息、占位符、排队中的文字、「已回复」的状态词。**它是允许作为文字的最浅一档**，最差 4.80 / 4.55（落在 `sidebar-accent` 上）。
- **`muted-foreground/60`**：**只做装饰**——禁用态、空心圆点。任何情况下都不能当文字色，它不在对比度表里（在纸上只有 2.52 / 3.19）。

### 强调与状态

- **`primary`**（`#1a6fd1` / `#529cca`）：链接、@ 提及高亮、「@ 提及」按钮、品牌河流标、主按钮底、`ring`。落在纸上 4.95（暗色 5.83）。`primary/10` 是提及菜单活动项与智能体页选中行的洗底——上一轮那个 `--accent-wash` 的等价物（`#1a6fd1` 10% 压在白上就是 `#e7f1fa`）。
- **`destructive`**（`#b0322d` / `#e88080`）：错误文字、发送失败外框、「确认清空」的实色底（配 `destructive-foreground`）。
- 四对状态洗底：

| 对 | 墨（浅 / 深） | 洗底（浅 / 深） | 用在 |
| --- | --- | --- | --- |
| `info` | `#2b6c92` / `#7fb6dc` | `#e7f3f8` / `#1c2b35` | 生成中：脉冲点、页头「当前 X」、发言顺序条亮项、报数「回复中」；Badge `info` 标 CLI 可运行 |
| `warning` | `#8a5a10` / `#d9a94a` | `#fbeedc` / `#33290f` | 草稿待更新：时间线药丸、成员栏草稿块与其按钮；Badge `warning` 标 CLI 已安装 |
| `success` | `#3d7a56` / `#6fb58b` | `#ebf6f1` / `#1c2f25` | 静止状态的实心点。洗底目前只作为 Badge `success` 变体存在，房间界面未用到 |
| `destructive-soft` | `#b0322d` / `#e88080` | `#fbe4e4` / `#3a1f1f` | 错误横幅、成员错误块、时间线错误药丸、报数「回复失败」 |

### 身份色

五位成员各一个 `chart-N`，一个值同时承担两件事：消息作者名的字色，和圆头像里两个字母的颜色。头像底是 `bg-chart-N/15`。

| 成员 | token | 字母 | 浅 | 深 |
| --- | --- | --- | --- | --- |
| claude-relay | `chart-1` | CR | `#6940a5` | `#b69be5` |
| claude | `chart-2` | CL | `#a25207` | `#e8955a` |
| codex | `chart-3` | CX | `#3a7351` | `#7cc29a` |
| opencode | `chart-4` | OC | `#ac3e79` | `#e48cbc` |
| dsh | `chart-5` | DS | `#636e0f` | `#b9c25a` |

它们落在纸上 ≥ 5.57 / ≥ 7.35，落在自己那层 15% 淡染底上 ≥ 4.53 / ≥ 5.67。

### 对比度

`global.css` 顶部的注释记录了完整复测：两族配对，共 134 对，全部 ≥ 4.5:1，实测最低 4.53（亮色 `chart-2` 落在自己的淡染底上）。

1. 每一对 `<x>` / `<x>-foreground`——这是 shadcn 保证「一个组件不论落在哪都读得清」的方式；
2. 每个文字色落在它在本应用里真正会落到的每一个表面上：`background / card / popover / sidebar / muted / accent / sidebar-accent`。

`/75`、`/15`、`/10` 都先合成到所在表面再测，因为浏览器就是这么画的。`muted-foreground/60`、`border`、`input` 是装饰，不参与。

相对样稿，十个值沿各自色相做过位移（亮色 `muted-foreground`、`info-foreground` 和四个 `chart-*`，暗色 `muted-foreground`、`destructive`、`chart-1`、`chart-4`），另外 `success` 洗底从 `#e7f3ee` 提亮到 `#ebf6f1`，因为 `success-foreground` 落在它上面只有 4.48。不要在不重测的前提下调亮文字色或调深表面。

### Named Rules

**The One Accent Rule.** 凡是能点、能选、正在聚焦的东西，用 `primary`；强调色不表意状态。一屏里 `primary` 的实心面积只该有主按钮和偶尔一枚新消息胶囊——当前导航项和当前房间用的是 `sidebar-accent`，不是强调色。

**The Pair Rule.** 状态永远成对取用：`bg-<x> text-<x>-foreground`，由 `Badge` 的一个 variant 名字交代完。不要把中性墨放到状态洗底上，也不要把状态色放到别的状态的洗底上。

**The Separate Vocabulary Rule.** 状态从状态色读，身份从 `chart-*` 读，两套永不互换。头像说的是「这是谁」，它旁边那颗点说的是「它现在怎么了」。运行中的成员，头像不变色，点变蓝并脉冲。

**The muted-foreground/60 Rule.** 它不是第四档文字，是装饰。任何要读的字最浅到 `muted-foreground` 为止。

## Typography

**两款字，一条分界：界面词是黑体，正文是宋体。**

| token | 字 | 用在 |
| --- | --- | --- |
| `--font-sans` | `Inter, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif` | 除正文外的一切：标题、作者名、时间、按钮、导航、节标签、药丸、提示行、提及胶囊 |
| `--font-serif` | `"Noto Serif SC", "Songti SC", "STSong", Georgia, serif` | 消息正文、输入框编辑区、右栏草稿预览、空状态那句说明 |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | 数字要对齐的地方：计时器、用时、报数序号、命令行路径、提及菜单的 `↵` |

宋体正文 16px / **1.7**（黑体是 1.65：宋体笔画细、字面小，多给一点行距才不挤）。两款字都自托管，来自 `@fontsource/inter`（400 / 500 / 600 / 700）和 `@fontsource/noto-serif-sc`（400 / 600），在 `global.css` 顶部 `@import`。

**加载：** `@fontsource/noto-serif-sc` 按 unicode-range 切成约 100 个分片，浏览器只拉这一页真正用到的那几片，中文不会一次性下载。`font-display: swap` 是 fontsource 的默认值，也是这里要的：首屏先用回退字渲染，字体到了再换一次，不做 FOIT——宁可换一次字，也不要让文字空白等着。因此 `document.fonts.check('600 16px "Noto Serif SC"')` 在正文没有粗体时是 `false`，那不是没加载成功，是这一片还没人要。

### Hierarchy

阶梯 **12 / 13 / 14 / 16 / 24**，不出现别的值；四个例外，都是记号不是文字：空状态标题 18px（标题的次级），头像字母 11px、22px 头像上 10px（`mark` / `mark-sm`），提及胶囊 15px（`chip`，比正文小一档，免得胶囊把行高撑开）和胶囊里那颗圆点的 8px（`chip-mark`）。

- **Headline**（700，24px，-0.02em）：房间标题、智能体页标题、创建页与错误页标题。一屏只有一个。
- **Title**（600，18px）：只有空房间的「这间房还没有消息。」。
- **Body**（宋体，400，16px，1.7，66ch）：消息正文与输入卡片的编辑区。
- **Name**（600，14px）：消息作者名，颜色取 `chart-N`；人的一方取 `foreground`。
- **Secondary**（400，14px）：页头副标题、导航项、房间列表项标题、成员栏里的 id、说明段、按钮文字（500）、字段内容。
- **Pill**（400，13px）：状态药丸、成员栏里的草稿块与错误块。
- **Label**（500，12px，`muted-foreground`）：节标签「房间」「成员 · 5」「检查连接」「可加入」。中文，不大写、不拉字距。
- **Meta**（400，12px）：时间戳、计时器、状态词、文字动作、页脚、房间列表元信息、输入框下的提示、角色词、序号、Badge。
- **Mark / Mark-sm**（600，11px / 10px，0.02em）：`AvatarFallback` 里的两个字母。
- **Chip / Chip-mark**（600，15px / 8px）：提及胶囊的名字，和胶囊前面那颗 14px 圆点里的两个字母。胶囊永远是黑体，即使它落在宋体正文里——它是一个界面对象，不是一句话的一部分。
- **Mono**（等宽栈，12px 或继承，`tabular-nums`）：计时 `0:47`、用时 `1:04`、报数序号、`PATH` 命令与版本。

### Named Rules

**The Tabular Clock Rule.** 会随时间跳动或会在一列里对齐的数字一律 `tabular-nums`（Tailwind 内置，不再自造 `.tnum`）；正在走的计时器同时切 `font-mono`，让宽度不抖。

**The Serif Is For Sentences Rule.** 宋体只给成段的句子：消息正文、正在写的那条、草稿预览、空状态的那句解释。凡是标签、按钮、状态词、时间、数字——只要它是界面在说话而不是人在说话——都是黑体。判断标准和文案纪律的第一条是同一条：这句话是读的，还是点的。

**The m:ss Rule.** 时长只用 `分:秒` 一种写法（`formatElapsed`：47 → `0:47`，125 → `2:05`）。已完成的回复写「用时 1:04」，不写「耗时」。

**The One Headline Rule.** 一屏一个 24px 标题，其余层级全部在 18px 及以下。

## Layout

**三栏网格**（`RoomWorkspace`）：`240px / minmax(0,1fr) / 300px`，高 `100dvh`，最小高 420px，`html` 最小宽 320px。左栏 `nav` 与右栏 `aside` 是 `sidebar` 底，各自贴一根 `sidebar-border` 边朝向中间；中栏 `main` 是 `background`。中栏内部分为页头、时间线（唯一伸缩区）、发言顺序条、输入卡片四段，后三段始终贴底。右栏的滚动交给 shadcn 的 `ScrollArea`。

**圆角**由 shadcn 的 `--radius: 0.5rem` 派生，三档正好是宣纸要的三档：`rounded-sm` 4px（按钮、输入、药丸、Badge）、`rounded-md` 6px（导航项、房间项、成员行、菜单项）、`rounded-lg` 8px（输入卡片、菜单、草稿块、报数记录块、抽屉里的卡片）。

**节奏**：4 / 8 / 12 / 14 / 22 / 28。

- 28px：中栏所有东西共用的左右留白（页头、时间线、发言顺序条、输入卡片的外边距）。
- 22px：页头顶内边距、时间线顶内边距、消息之间的间距、输入卡片的底外边距。
- 18px：右栏上下内边距。
- 14px：页头底内边距、左栏上下内边距、输入卡片左右内边距。
- 12px：头像与正文之间、输入卡片顶内边距、时间线底内边距。
- 10px：左栏左右内边距。
- 8px / 4px：控件之间、紧挨的图标与文字、成员行的左右内边距。

**测量**：消息正文与控制台消息 `max-w-[66ch]`；空房间的说明 `max-w-[46ch]`；智能体页整体 `min(760px, 100%)`。

**列网格**：每条消息和每个轮次行是 `grid-cols-[30px_minmax(0,1fr)]`，间隙 12px。30px 就是 `AgentMark` 的默认直径。

**响应式**：

| 断点 | 变化 |
| --- | --- |
| ≤ 1180px | 右栏不再是网格里的一列，改由 shadcn 的 `Sheet`（`side="right"`，`min(320px,100%)`，`sidebar` 底）承担。两者只挂载一个：`RoomContext` 用 `matchMedia('(max-width: 1180px)')` 选择，所以文档里不会出现第二份面板 id 或第二个「读取更新并重答」。服务端渲染的是并排那一列，切换发生在 hydration 之后。页头出现「成员」按钮把抽屉拉出来。遮罩是 `foreground/20`，不是 shadcn 默认的 `black/50`——这套配色里不放纯黑。 |
| ≤ 820px | 网格变单列两行，左栏变成横向顶栏：项目横排、可横向滚动、右边框改成底边框；节标签「房间」、房间的元信息、页脚隐藏；新建房间表单固定 260px 宽。 |
| ≤ 720px（仅智能体页） | 左列表 / 右表单的两栏变单栏。 |

### Named Rules

**The Hairline Rule.** 栏与栏之间只有一根 1px `border`，没有色块、没有阴影、没有色相差。要在纸上分出一块区域，用留白或一根 `Separator`，不要换底色。

**The Bottom Stack Rule.** 发言顺序条和输入卡片贴在中栏底部，因为它们讲的是「此刻」，要挨着人动手的地方；页头只留一句进度。

## Elevation & Depth

这套系统是平的。表面之间靠一根线和一档明度分层，静止状态下只有一个东西有阴影。

**`shadow-card`** 是唯一的阴影值（`@theme inline` 里的 `--shadow-card`，取 `--card-shadow`）：亮色 `0 1px 3px rgb(0 0 0 / 0.06), 0 4px 14px rgb(0 0 0 / 0.04)`，暗色对应加深。它属于：输入卡片、房间菜单、提及菜单、成员抽屉、新消息胶囊、新建房间表单、创建页与错误页的卡片、跳转链接。别的东西不投影——shadcn 组件自带的 `shadow-xs` 已经从 Button / Input / Textarea 里去掉。

**焦点**用 shadcn 的写法：`focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`。输入卡片把它挂在 `focus-within` 上，因为卡片就是字段，焦点落在整张卡片上而不是里面那个透明的 textarea。裸 `<button>`（全局 `all: unset` 之后）在 `@layer base` 里补一圈 2px `ring` 描边。

两处 `inset` 阴影不是深度，是描边：发言顺序条与成员栏里「还没轮到」的空心点用 `inset 0 0 0 1px currentColor` 画环。

**The One Float Rule.** 一屏里真正浮起来的是输入卡片。菜单、抽屉、胶囊也用同一个阴影值，因为它们同样盖在别的内容上。不要引入第二个阴影值。

## Components

组件全部来自 `app/components/ui/*`，由 `npx shadcn@latest add` 装入（`components.json`：new-york、neutral、cssVariables、phosphor 图标、`~/components/ui` 别名）。本仓库在 React 19，`ref` 是普通 prop，组件保持 registry 原样的函数写法。相对 registry 的改动只有两类，每个文件顶部都写了原因：

1. **尺度**：圆角 6px → 4px，控件高 36px → 30px，去掉 `shadow-xs`——这套系统是平的。
2. **动效**：`tw-animate-css` 没有安装，`slide-in` / `zoom-in` / `fade-in` 这些 class 已从 `Sheet` 和 `DropdownMenu` 里删掉，而不是留成无效 class。这套系统只过渡颜色。

`lucide-react` 没有安装：`shadcn add` 带进来的图标已换成 `components.json` 指定的 phosphor（`XIcon` → `X`，`CheckIcon` → `Check`，`ChevronRightIcon` → `CaretRight`，`CircleIcon` → `Circle`）。

`ui.ts` 只剩一个纯排版集群 `sectionLabel`；上一轮的 `primaryButton / ghostButton / textAction / field / pill` 全部由组件取代。

### Button

标准 variant（`default` / `outline` / `ghost` / `secondary` / `destructive` / `link`）与 size（`default` 30px / `sm` 26px / `xs` 24px / `icon` 30px / `icon-sm` 28px / `icon-xs` 24px）。

- **default**：`primary` 底 `primary-foreground` 字，hover `primary/90`，无内高光。用于「发送」（卡片里 28px）「保存」「创建房间」「新消息」。
- **outline**：透明底 `input` 边 `foreground/75` 字，hover `accent`。用于「管理成员」「成员」「返回房间」「重新扫描」「读取更新并重答」（配 `warning-foreground` 的边与字）和 `CrewComposer` 的三个图标按钮。
- **ghost**：无边，hover `accent`。用于「新建」「取消」「编辑」「完成」「开始报数」「主题：…」「@ 提及」和三点菜单的触发器。
- **destructive**：`destructive` 底 `destructive-foreground` 字。只用在「确认清空」。
- `destructive` 取 `destructive-foreground` 而不是 registry 写死的 `text-white`：暗色下 `destructive` 是一抹亮红，白字在上面读不了。

### Badge

4px 圆角，`px-2 py-0.5`，12px / 500。变体：`muted`（`accent` 底 + `muted-foreground`，标 CLI 未安装）、`info`（可运行）、`warning`（已安装）、`success`、`destructive-soft`，加上 registry 自带的 `default` / `secondary` / `destructive` / `outline` / `ghost` / `link`。

**状态药丸**也是 `Badge`：时间线里 held 的那一行是 `variant="warning"`，error 的那一块是 `variant="destructive-soft"`，外加一个 `statePill` 类把它拉到宣纸的药丸尺寸（13px、`px-2.5 py-[5px]`）、允许换行、并在网格列里铺满宽度（stock Badge 是 `w-fit`）。

### DropdownMenu（房间菜单）

页头的 ··· 是 `DropdownMenuTrigger asChild` 包一个 `ghost`/`icon` 的 Button，弹层 224px 宽、`popover` 底、`input` 边、8px 圆角、`shadow-card`，菜单项 6px 圆角、hover `accent`。里面只有「清空对话」一项；点击后 `onSelect` 阻止默认关闭，菜单内容换成两步确认：「清掉这间房的对话？房间和成员都保留。」+「取消」/「确认清空」。**没有用 `AlertDialog`**：这是一句两个词的确认，不值得占满整屏。

### Sheet（成员抽屉）

见 Layout 的响应式表。`showCloseButton={false}`——面板自己那颗 X 留在「编辑」旁边，位置和上一轮一样。

### Avatar（`AgentMark` / `HumanMark`）

`Avatar` + `AvatarFallback`，`AgentMark` 是薄封装：把 agentId 映射到 `bg-chart-N/15 text-chart-N` 和两个字母（CR / CL / CX / OC / DS）。直径 30（时间线）/ 22（成员栏、编辑列表、空状态）/ 36（智能体页）由 `style` 传，字 11px（22px 时 10px）/ 600 / 0.02em，`aria-hidden`。人的记号是 `foreground` 实底上一个 `background` 色的「我」字。状态永远不从记号读：运行中记号不变，排队中只降到 `opacity-55`。

品牌标 `RiverMark` 不变：两条错位的正弦短线，`primary` 色。

### 提及胶囊（`mention-chip.ts`）

一个提及在正在写的那条里和在已发出的那条里长得一模一样——它是同一个东西的两个时刻，不能有两套样式。所以胶囊的描述只有一份，被三处读：Tiptap 节点的 `renderHTML`（它产出的是 DOM spec，不是 JSX，所以共享的是数据而不是组件）、已发消息里的只读胶囊、以及提及菜单。

`inline-flex` 的圆角胶囊，底 `bg-chart-N/15`、字 `text-chart-N`、15px / 600 黑体、`px-1.5`、`align-baseline`，前面一颗 14px 的圆点：`bg-chart-N` 底上 8px 的两个大写字母，和头像用同一张字母表（CR / CL / CX / OC / DS）。`@all` 用 `bg-accent text-accent-foreground`，圆点里是 `@`。

id → class 的映射写成常量表（五个成员加 `all`），不拼串：Tailwind 只认源码里的字面 class。

### Separator

用在发言顺序条顶部那根线——一个真正独立的分隔，不是某个元素的边。**没有**在节标签下面加新的分隔线：宣纸那里本来就没有线，加一根是改画面而不是换词表。

### ScrollArea

右栏与成员抽屉的滚动容器。时间线保持原生滚动容器，因为它要直接读写 `scrollTop` 来判断「是否贴底」和跳到底部。

### Inputs / Fields

`Input` 30px 高、4px 圆角、`input` 边、透明底、`px-2`、14px；`Textarea` 同样但 `py-1.5`、可竖向拉伸。占位符 `muted-foreground`，禁用 `opacity-45`。

### Composer（`RoomComposer`）

输入区是这一屏唯一浮起的物件，也是唯一一处富文本：一个 Tiptap 编辑器，schema 只有 `Document > Paragraph+ > (Text | Mention | HardBreak)*`。没有标题、列表、加粗——这是一行话，不是一篇文档。

- **卡片**：`card` 底、`input` 边、`rounded-xl`（12px，比别处的 8px 更圆，因为它是唯一一个要被当成「盒子」看的东西）、`shadow-card`、内边距 `14px 14px 10px`、`mx-7 mt-3 mb-[22px]`。`focus-within` 时 `border-ring` 加 3px `ring-ring/15` 的外圈——卡片就是字段，焦点落在整张卡片上，编辑区自己不带边、不带底、不带焦点环。
- **编辑区**：`font-serif text-base leading-[1.7]`，最小三行（78px），最高 `40dvh` 后内部滚动。占位符「说点什么」由 Placeholder 扩展画成 `::before`，`muted-foreground`。`role="textbox" aria-multiline="true" aria-label="向房间发送消息" aria-describedby="room-composer-hint"`，id 仍是 `room-command`（跳转链接指着它）。弹层开着时补 `aria-expanded` / `aria-controls` / `aria-activedescendant`。
- **工具栏**：编辑区下一根 `border-t border-border`，`mt-2.5 pt-2.5`。左起：`@` 图标按钮（`ghost` / `icon-sm`，phosphor `At`），12px `muted-foreground` 的提示行（一轮进行中「发送后将排在 X 之后」，否则「Enter 发送 · Shift+Enter 换行 · 不 @ 时全体成员依次回复」）；右侧：字数「n / 2000」（`tabular-nums`，n > 0 时才出现，超限转 `destructive`），和一枚 32px 的圆形主按钮（phosphor `ArrowUp`），空或发送中时禁用，`aria-label` 在「发送」与「发送中」之间切换。**没有附件按钮**：后端不收附件，界面就不放这个控件。
- **键位**：Enter 发送（弹层开着时改为选中当前项）；Shift+Enter 换行；Escape 关弹层；`event.repeat` 不重复发送。输入法合成期间（`view.composing` / `isComposing` / `keyCode === 229`）Enter 被整个吞掉——它既不发送、不选人，也不落到基础 keymap 上把段落劈开：确认中文候选不是换行。
- **字数**：数的是**序列化之后的字符串长度**，不是文档里的字符数。一个胶囊在屏幕上是一个物件、在线路上是八个字符，而服务端量的是线路上那一串（`> 2000` 直接拒绝）。`CharacterCount` 仍然配了 2000 的上限，作用是给文档本身封顶，不是给这个数字做依据。

### 文档与字符串（`composer-doc.ts`）

**发出去的仍然是字符串**，`RoomLab`、`parseRoomMessage`、服务端一个字没改。两个纯函数是全部的桥：

- `docToText(json)`：段落之间 `\n`，`HardBreak` → `\n`，Mention → `@id`，首尾 trim（所以按过一次 Enter 留下的空段落不会让一条空消息看起来非空）。
- `textToDoc(value, mentionable)`：按 `\n` 切段落，再用**服务端同一条正则**（`ROOM_MENTION_SOURCE`，从 `room-message.ts` 导出）把 `@id` 切成 Mention 节点。只有房间真的认识的 id 才会变成胶囊：`@nobody` 对服务端不是提及，在这里也就不许长得像提及。

两个方向都要成立，因为它们在不同时刻各用一次：每次敲键盘把文档序列化成字符串交给 `RoomLab`，发送失败时再把那串原文交回来重建文档。只在一个方向上成立的提及，会在第一次发送失败时把胶囊变成散字。

### 提及（`composer-mention.tsx` + `MentionMenu`）

- **弹层**由 Tiptap 的 suggestion `render()` 驱动（`onStart / onUpdate / onKeyDown / onExit`），用 `ReactRenderer` 挂到 body 上，`clientRect` 定位在光标上方 6px，上方放不下时翻到下方。语义没变：`role="listbox"`、一项一个 `role="option"`、`aria-selected` 在当前项上。**没有换成 shadcn 的 `Command`**：它是编辑区的内联补全，`aria-activedescendant` 归编辑区管，换成 Command 会把焦点从输入框里拿走。
- **每一项**：22px 的 `AgentMark`、id、12px `muted-foreground` 的角色词，当前项右侧一枚 `↵` 的 `<kbd>`、底色 `accent`。`@all` 那一项的圆点是 `accent` 底上一个 `@`，说明写「所有在场成员」。
- **`@` 按钮**在光标处插入 `@` 触发弹层；前面不是空白时先补一个空格（`@` 只在词边界触发）。编辑区还没被聚焦过时先把光标送到末尾，否则会插到所有已输入内容的前面。

### Copy（`copy.ts`）

所有上屏文字都在 `app/room-lab/presentation/copy.ts` 一个字典里，按**被读的方式**分四组；组件只引用 key，不写字面量。`copy.test.ts` 用几条正则守着每组的语法，所以口语状态词（「说完了」）或者写成句子的标签回不来。

| 组 | 读法 | 语法 | 例 |
| --- | --- | --- | --- |
| `status` | 扫：在列表里和圆点、数字并排 | 名词短语，只有四种构词：**已X · X中 · 待X · X失败**（加裸状态「在场」「等待」） | 已回复 · 生成中 · 排队中 · 草稿待更新 · 运行失败 · 已读未答 |
| `action` | 做：按钮、菜单项 | 动词短语，不带句号 | 发送 · 创建房间 · 读取更新并重答 · 开始报数 |
| `label` | 认：节标题、导航、表单标签、占位 | 名词，不带句号 | 成员 · 5 · 检查连接 · 房间名 |
| `say` | 懂：说明、空状态、错误、页头那一句 | 完整陈述句：事实 + 下一步 | 发送失败，内容已保留在输入框 |

判断一个字串属于哪组很机械：会和别的字串并排出现的，是 `status` 或 `label`；点了会发生事的，是 `action`；其余是 `say`。

read model 的状态词永远不上屏，经 `agentStatusLabels` 翻译成 `copy.status`：

| 状态 | 上屏文案 | tone | 点 / 字色 |
| --- | --- | --- | --- |
| idle | 在场 | quiet | `success-foreground` / `muted-foreground` |
| running | 生成中 | run | `info-foreground` / `info-foreground` |
| completed / posted | 已回复 | quiet | `success-foreground` / `muted-foreground` |
| held | 草稿待更新 | held | `warning-foreground` / `warning-foreground` |
| silent | 已读未答 | quiet | `success-foreground` / `muted-foreground` |
| error | 运行失败 | err | `destructive` / `destructive` |
| （派生）queued | 排队中 | — | 空心环 / `muted-foreground` |
| 报数每行 | 已回复 · #seq / 回复中 / 回复失败 / 等待 | | |

页头那一句也是名词形式，好和成员栏并排读：「当前 codex · 待回复 2 位」「当前 dsh · 最后一位」「dsh 即将开始」。

确认过的文案纪律：

1. **一个判断标准**：这个词，使用者在界面之外还会不会碰到？会，就必须用同一个词（agent 的 id 原样英文）；不会，就是实现细节漏上来了。这条只管**用哪个词**，不管语气。
2. **语气中性**：操作型界面没有人格，读的人在看一台机器的状态。个性只允许出现在空状态那一句里。
3. **人叫「你」**，产品叫 Rivus，房间叫「房间」。
4. **等待要有数字**：生成中 = 脉冲点 + 真在走的计时器；已回复 = 「用时 1:04」。
5. **HELD 草稿不是已发出的事实**：草稿正文只能出现在成员栏的「查看草稿」里。
6. **没有假控件**：后端没有 stop，界面就没有「停下这一轮」。
7. **空状态要教会界面**，不写「暂无」。
8. **模板不写死数据**：人数、顺序、用时全部来自 read model。
9. **不隐瞒代价和不确定**：「在场不代表连接可用」。

## Motion

- **颜色过渡**：可交互元素 `transition-colors` / `transition-[color,box-shadow]`，150ms。没有位移、缩放或阴影的过渡；shadcn 组件里的 `slide-in` / `zoom-in` 已删除。
- **唯一的动画**：`animate-pulse-soft`（`@theme` 里的 `--animate-pulse-soft`，`rivus-pulse 1.4s ease-in-out infinite`，透明度 1 → 0.25 → 1）。只用在「生成中」的状态点上。它旁边必须有真在走的计时器。
- **减少动效**：`prefers-reduced-motion: reduce` 时所有动画取消、所有 `transition-duration` 归零。

## `/board` 与 `/task`

这两个路由不在本轮范围。上一轮它们靠 `@theme inline` 里的旧别名（`paper` / `washi` / `muted` / `moss` / `seal` …）活着；别名这一轮全部删除，所以对这两个文件做了**纯机械的类名替换**，不改结构、不改逻辑：

| 旧 | 新 | 备注 |
| --- | --- | --- |
| `bg-paper` | `bg-background` | |
| `bg-washi` | `bg-muted` | `washi` 是 `#f7f7f5`，等于 `muted`，不是 `card`（`#ffffff`） |
| `text-muted` | `text-muted-foreground` | |
| `text-ink` | `text-foreground` | |
| `border-line` | `border-border` | |
| `text-moss` / `text-moss-deep` / `bg-moss` / `border-moss/40` | `text-primary` / `bg-primary` / `border-primary/40` | `moss-deep` 并到 `primary`，词表里没有更深一档 |
| `ring-moss` | `ring-ring` | |
| `text-paper` | `text-primary-foreground` | 它落在 `bg-moss` 上 |
| `text-seal` / `border-seal` | `text-destructive` / `border-destructive` | |
| `text-hydrangea` / `border-hydrangea/40` | `text-info-foreground` / `border-info-foreground/40` | |
| `border-gold` | `border-warning` | |

## Do's and Don'ts

### Do:
- **Do** 用 shadcn 的 token 名字。要新表面先问：现有的 `background / card / popover / sidebar / muted / accent` 里有没有一个已经是这个角色。
- **Do** 状态成对取用：`bg-<x> text-<x>-foreground`，写成 `Badge` 的一个 variant。
- **Do** 身份用 `chart-1…5`，按就座顺序；作者名和头像字母取同一个。
- **Do** 圆角走 `rounded-sm / md / lg`（4 / 6 / 8px），它们从 `--radius` 派生。
- **Do** 控件用 `~/components/ui/*` 的组件，不要再写 class 集群。
- **Do** 改 shadcn 组件时在文件顶部写清为什么偏离 registry。
- **Do** 计时、用时、序号、时间戳用 `tabular-nums`，时长写 `m:ss`。
- **Do** 成段的句子（`copy.say`）用 `font-serif`，界面在说话的地方用 `font-sans`。
- **Do** 提及一律走 `mention-chip.ts` 的那张表，编辑中和已发出用同一份描述。
- **Do** 保持输入框永远可用，一轮进行中只改提示行。

### Don't:
- **Don't** 再造 token。上一轮的 `--canvas / --side / --stream / --raised / --ink-N / --sel / --run / --held / --err / --done / --id-N` 已经删干净，不要以别的名字回来。
- **Don't** 用 `muted-foreground/60` 写任何要读的字，它只做禁用态和空心圆点。
- **Don't** 用 `primary` 表意「正在运行」或「成功」；运行是 `info`，完成是 `success-foreground` 的绿点。
- **Don't** 把中性墨放到状态洗底上，或把 `destructive`（实色红）当成柔和的错误洗底用——那是 `destructive-soft`。
- **Don't** 引入第二个阴影值，或给静止的表面投影。
- **Don't** 用方形头像、SVG 符号头像、位图头像。
- **Don't** 在阶梯（12 / 13 / 14 / 16 / 24）之外造字号；18px 只留给空状态标题，10 / 11px 只留给头像字母。
- **Don't** 放后端没有的动作：没有「停下这一轮」，没有对失败成员的「重试这一位」，没有看板导航。
- **Don't** 让 read model 的词（idle / running / held / posted / seat）出现在界面上。
- **Don't** 给输入框加标题、列表、加粗或附件按钮：schema 里没有的东西，工具栏上也不该有。
- **Don't** 用文档里的字符数当字数上限——服务端量的是序列化之后那一串。
- **Don't** 在编辑区之外的地方用宋体，也不要让胶囊跟着正文变成宋体。
