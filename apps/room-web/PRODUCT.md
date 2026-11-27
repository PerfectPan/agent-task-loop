# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

一个人，在自己的电脑上，同时使唤好几个本地编码 agent。装了哪几位由使用者的机器决定，不由产品决定。
典型场景是深夜独自工作：开一间房，把问题说一遍，让在场的 agent 在同一条对话流里各自阅读、工作、发言或保持沉默，然后接着说。
使用者是开发者，懂 CLI 和 git，但不想在界面里读到系统内部的词。

## Product Purpose

Rivus room-web 是本地多 agent 的聊天室。一句话发给房间，所有成员读写同一条对话流，通过 Room MCP 工具（`room_speak`、`room_read`、`room_dm`）发言或私聊。
它存在的理由是把「多个 CLI 各自开一个终端来回粘贴」变成一条时间线。
成功的样子：使用者随时知道谁正在阅读或工作、已经跑了多久、谁发言了或沉默了、谁超时或失败了，并且永远能继续往下说。

## Positioning

Room 协议保证共享事实的一致性：每个 agent 发言前必须读到自己未读的最新消息，并发写入若落后于最新序号会在回合内被 `HELD`，重读后再决定发言或放弃（`HELD` 不暴露在对话界面上）。
邻近产品把多个模型并排放，各答各的；这里所有人在同一条流里接话，后说的人看得见先说的人。

## Operating Context

- 全部本地：服务只绑 `127.0.0.1`，房间存在本机 `~/.rivus/room-web/v1/rooms.sqlite`（成员 lease 存在同目录 `member-leases.sqlite`），agent 通过本机已登录的 ACP 适配器调用。没有账号、没有云端。
- 单回合默认超时 10 分钟，可按智能体行配置更短的 `timeoutMs`。使用者在等待里最需要的是「谁在读/工作、跑了多久」。
- 房间默认广播唤醒（`wake = broadcast`），也可切换为仅唤醒被提及成员（`addressed`）或开启逐个运行（`serial`）。消息可以 `@` 单独一位或 `@all`；发言中途再发消息不会被拒绝。
- 成员顺序可以调整；开启「逐个运行」时按此顺序依次运行。
- 智能体页面维护每位 agent 的配置与常驻系统提示，所有房间共用，存在本机。
- 每位 agent 是 `rooms.sqlite` 里 `agents` 表的一行：id、显示名、角色词、ACP 命令、建行时随机分到并存下的身份色、可选 `timeout_ms` 以及系统提示。产品不区分「内建」和「自定义」，首次打开时预置 `claude-agent-acp`、`codex-acp` 和 `opencode acp`。
- 行为指令属于 agent 自己：房间的提示词只给房间事实（你是谁、这间房有几位、说过什么），具体风格要求写在各自的系统提示里，改完下一轮生效，不用重启。

## Capabilities and Constraints

- 已有动作：发消息、`@` 提及（含自动补全）、管理成员（增删排序）、房间设置（唤醒模式、逐个运行、工作目录）、查看并参与成员间私聊子房间（`room_dm`）、清空对话（保留房间）、新建房间、切换房间、在智能体页新增/编辑 agent 与重新扫描探测。
- 没有的动作：停止正在进行的一轮；对失败的回复单独重试（只能再发一条消息）。界面不得放这些假控件。
- 成员状态词表（`app/room-lab/read-model.ts`）：`present`、`reading`、`working`、`posted`、`passed`、`timeout`、`failed`。界面文案统一由 `app/room-lab/copy.ts` 与 `app/room-lab/presentation/agent-status.ts` 映射，不直接露出内部词。
- `HELD` 属于协议层回合内冲突解决，不进入「房间对话」正文，也不向人展示。
- 界面保留只读任务看板路由 `/board` 与 `/task/:id`（通过 `@rivus/agent-task-loop/task-management` 读取），暂不放入房间导航。
- 人的一方在界面里叫「你」。
- 面向中文使用者；agent 的 id（如 `codex`、`claude`、`opencode` 等）以英文原样出现，`agents` 表里写的是什么就显示什么。

## Brand Commitments

- 产品名 Rivus。
- 头像由代码生成，不用插画素材：首字母取自 agent id，底色取自它在 `agents` 表里的那一列。
- 文案纪律（由 `app/room-lab/copy.test.ts` 守卫）：一个词若使用者在界面之外碰不到，就不能出现在界面上；模板不得写死数据；按钮文字来自动作本身。

## Evidence on Hand

- 真实 read model：`app/room-lab/read-model.ts`；真实服务行为：`app/room-lab/application/room-service.server.ts`。
- 唯一文案词典与语法测试：`app/room-lab/copy.ts`、`app/room-lab/copy.test.ts`。
- 视觉与组件规范：`apps/room-web/DESIGN.md`。

## Product Principles

- 等待要可见：谁在读/工作、跑了多久，比任何装饰都重要。
- 输入框永远可用：成员运行中也能继续发言。
- 只展示真实存在的动作；后端没有的事，界面不放按钮。
- 状态只有一个真相：对话流、页头与成员区显示同一组人的同一组状态。
- 词跟着架构走，不跟着语感走。
