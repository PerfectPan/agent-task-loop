# @rivus/agent-orchestration

本包装一场编排。下面的词是领域语言，实现和文档都用这些，不要另起别名。

## Language

**Run**:
一把钥匙下的一场编排：有哪些座位、现在谁能动手、发生过什么。从 `open` 开始占用，到 `release` 结束占用。工单可以比一场 Run 活得更长。
_Avoid_: Task, Session, Team, Workflow, 报数场

**Key**:
一场 Run 的名字，字符串。例如 `task:T-1`。内核只当钥匙，不解析前缀。
_Avoid_: 把 `taskId` 当成内核类型

**Seat**:
这场里一个可点名的参与者，就是一个名字（如 `impl`、`review`）。不是一个进程，也不是 claude/grok 二进制。
_Avoid_: Team, Lead, Role 类, Coding Agent, 机器人

**Token**:
上场权。发给某个 Seat（可选绑一块 `partition`，例如目录）。一场最多 `maxTokens` 张同时有效；没牌不能开进程。看见记录不能自己上场。默认 `maxTokens = 1`；要并行就发多张，活必须切开。
_Avoid_: 报数, Raft leader, 选举, 大家看完自己上

**Term**:
Token 的代数，只增不减。换人或重发 Token 就加一，用来发现过期的「我以为轮到我」。
_Avoid_: 把本包装成 Raft

**Channel**:
这场的记录本，只追加、有顺序（`idx` + `Term`）。谁写给谁、写了什么，都在这里。以后的界面也读这一本，不另搞一套。
_Avoid_: Slack, 飞书会话, A2A, 用共享状态当排班板

**Message**:
Channel 上的一条，写给某个 Seat（或所有人）。对方用客户端去读，不因此获得 Token。
_Avoid_: 邮件, 邮箱（可以叫记录/留言，不要当产品名）, MCP 消息

**Coding Agent**:
某个 Seat 请来跑一拍的编程 CLI（claude / codex / grok …）。它不是 Seat，也不和别的 CLI 直接说话。
_Avoid_: 把 CLI 叫成 Agent 对等体, Rivus Agent, A2A Server

**Client**:
读/写 Channel 的程序。v1 **默认是本机命令 `orch`**：Coding Agent 在自己的 shell 里 `orch pull` / `orch send`。身份来自开跑时写入的环境（`ORCH_RUN` / `ORCH_SEAT`），不能冒充别的座位。没有 shell 的才退回：开跑时把未读 Message 写进 prompt。
_Avoid_: 把 MCP 或 A2A 当成内核协议, 工作区里丢 inbox.json, 往另一个 CLI 的屏幕里打字（那是 Herdr，不是本包）

**open / release**:
开始占用 / 结束占用这一场 Run。崩溃未 release 时，心跳过期后下一次 open 可以接管同一把 Key。
_Avoid_: 用工单状态表示占用

**grant / pass**:
发给一个 Seat 一张 Token（已满则失败，或指定收回哪张再发）/ 持有者把一张转让给另一个 Seat。
_Avoid_: allow 当随便改的字段, 用发 Message 代替发 Token

## 它做什么

排班（谁上场）和记账（留言在 Channel 里）。不管审不审、发不发 PR、飞书谁 @ 了谁。那些是调用方的事。

内核没有 `Team`、`Lead` 类型。座位名是数据。

## 通信（默认 CLI）

Coding Agent 不和别的 CLI 直接说话。它们读/写这场的 Channel：

```text
# 开跑时编排已设置 ORCH_RUN、ORCH_SEAT
orch pull                         # 拉给我的新 Message
orch send review "请看 auth.ts"    # 以当前座位写给 review
orch log --from 12                # 读 Channel（和以后界面同一份）
```

`orch send` 只记账，不发 Token。对方上场后再 `orch pull` 才能看到。

没有 shell 的进程：调用方在开跑时把未读 Message 写进 prompt，效果相同。

## Architecture

本包按 DDD 分层、按 CQRS 走路：

| 层 | 职责 |
| --- | --- |
| `domain/` | `Run` 聚合、`Template`、不变量、领域错误。不碰存储，不碰 Node |
| `application/commands.ts` | 写：open / grant / pass / send / heartbeat / release … |
| `application/queries.ts` | 读：snapshot / channel / inbox / inspect。不改 Token，不追加 Channel |
| `infrastructure/` | SQLite、时钟、进程存活、`createOrchestration` |

`inbox({ markRead: true })` 先走查询，再发一条 `markInboxRead` 命令。Channel 是领域事件本。

## API

```ts
import { createOrchestration } from '@rivus/agent-orchestration';

const orch = createOrchestration({ dbPath: './orchestration.db' });
orch.templates.register({
  id: 'classic-delivery',
  seats: ['impl', 'review'],
  startSeat: 'impl',
});

const run = orch.open({ key: 'task:T-1', template: 'classic-delivery', goal: 'fix the leak' });
orch.grant({ key: run.key, seat: 'impl', expectedTerm: run.term });
orch.send({
  key: run.key,
  from: 'impl',
  to: 'review',
  mailKind: 'review-request',
  body: JSON.stringify({ summary: 'please look at auth.ts' }),
});
orch.pass({ key: run.key, from: 'impl', to: 'review', expectedTerm: 1 });
orch.release({ key: run.key });
```

`open` 成功会盖 `lastHeartbeatAt`。调用方要自己按时 `heartbeat({ key })`，否则 120s 后同一把 Key 可以被接管。`send` 只记账。

## Logs

每条内核命令一行 JSON，写到 stderr，前缀 `[orch]`：

```text
[orch] {"cmd":"open","key":"task:T-1","ok":true,"term":0,"idx":3}
[orch] {"cmd":"grant","key":"task:T-1","seat":"impl","ok":true,"term":1,"idx":4}
[orch] {"cmd":"open","key":"task:T-1","ok":false,"code":"orchestration-conflict","metric":"orch_open_conflict_total"}
```

`ORCH_LOG=0` 可关。`stale-takeover` / CAS 失败 / 无牌 spawn 会带 `metric`。Channel 仍是这场的审计本；这些行是操作日志。

ATL 占用包装另外打人话：

```text
[agent-task-loop] orch open key=task:T-1
[agent-task-loop] orch heartbeat started key=task:T-1 intervalMs=15000
[agent-task-loop] orch grant seat=impl key=task:T-1 term=0
[agent-task-loop] orch release key=task:T-1
```

需要 Node.js `>=22.13`（`node:sqlite` 的 `DatabaseSync`）。数据库默认在 `~/.agent-orchestration/orchestration.db`，必须放在本地磁盘。

## Status

内部包（`private: true`）。领域语言以本文为准；实现按 `rfcs/0011-agent-orchestration.md` PR1 对齐。
