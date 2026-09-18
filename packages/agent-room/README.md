# @rivus/agent-room

Shared **posted stream**, per-agent session, and write-point HELD.

This package does not know tasks, occupancy seats, Feishu, or ReviewLoop.
Callers inject the capability port for the slice they use. `rivus-agent` is the first live adapter.

See RFC 0010 Chapter B.

## Domain model

- `Room` is the aggregate root for one ordered conversation stream. It owns
  sequence assignment, external transport idempotency, and bounded reads.
- `RoomEvent` is an entity identified by its sequence inside a Room.
- Only externally admitted events carry `transportMessageId`; internal agent
  and control-plane posts use their sequence as identity and are not transport
  deduplication candidates. `messageId` remains the compatibility/display field.
- `AgentSessionAggregate` is a separate aggregate root for one agent runtime's
  seen cursor and one-shot hold.
- `replyInSerial` is the domain service that applies HELD across Room and
  AgentSession in one serialized write.
- `shouldWake` is a stateless domain service; persistence adapters do not decide
  wake policy.

See RFC 0012 for the repository-wide dependency rules.

## Status

Internal package (`private: true`). Not published yet.

**1a — port + memory `admit`**
- `RoomAdmissionStore` port (`admit` + `head` only)
- `Room` aggregate owns identity, sequence, idempotency, and hydration rules
- `createMemoryRoomStreamStore()`
- `admit` is idempotent on transport `message_id`
- `head` returns the last posted seq (0 if empty)
- broader stream capabilities land in later slices

**1b — AgentSession seen / hold**
- `ensureSession` / `inspectSession`
- `advanceSeen`
- `hold` + one-shot `ackHold` bound to `heldUpToSeq`
- preemptive ack is ignored

**1c — `replyInSerial` HELD + `readSlice`**
- one critical section: read seen, compute newer (`author ≠ self`), HELD or append `head+1`
- `origin: "control-plane"` takes a seq, skips chat HELD, does not `advanceSeen`
- memory store is the proof; sqlite is a later adapter

**2 — wake evaluator**
- `mention-only` | `all-human-messages`
- companion posts default do not wake
- see ≠ wake

## Non-mixing

Occupancy `allow(seat)` is not a chat reservation. Room HELD is not `task-start`
exclusion. Do not import `@rivus/agent-orchestration` or `@rivus/agent-task-loop`.
