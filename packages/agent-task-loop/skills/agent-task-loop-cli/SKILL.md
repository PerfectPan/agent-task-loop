---
name: agent-task-loop-cli
description: Use when operating the repo-local Agent Task Loop CLI from this workspace, especially to start, watch, resume, or complete Feishu Base backed agent tasks through the local npx entry.
---

# Agent Task Loop CLI

## Overview

这个 skill 只负责把自然语言任务动作映射到本仓库里的 `agent-task-loop`。
不要自己重写任务状态机、review loop 或发布逻辑，统一调用 CLI。

## When to Use

- 需要启动一条 Feishu Base 任务
- 需要查看某条任务进度
- 需要恢复执行 / review 会话
- 需要在验收后自动提交、push、创建 Pull Request

不要在这些场景里直接拼 `pnpm dev ...`。优先使用仓库根本地入口：

```bash
npx --no-install @rivus/agent-task-loop <command> ...
```

## Commands

```bash
npx --no-install @rivus/agent-task-loop sync
npx --no-install @rivus/agent-task-loop schema
npx --no-install @rivus/agent-task-loop start --task <TaskID>
npx --no-install @rivus/agent-task-loop watch --task <TaskID>
npx --no-install @rivus/agent-task-loop resume --task <TaskID>
npx --no-install @rivus/agent-task-loop complete --task <TaskID>
```

## Command Mapping

- “启动这条任务” → `npx --no-install @rivus/agent-task-loop start --task <TaskID>`
- “盯一下进度” → `npx --no-install @rivus/agent-task-loop watch --task <TaskID>`
- “我要看 claude / codex 会话” → `npx --no-install @rivus/agent-task-loop resume --task <TaskID>`
- “验收通过，发布掉” → `npx --no-install @rivus/agent-task-loop complete --task <TaskID>`

## Notes

- CLI 会自动发现 `task.config.ts`，不需要默认再写 `--config`
- 如果用户明确指定了别的配置文件，再补 `--config <path>`
- 这个 skill 假设当前工作目录在仓库根或其子目录内
