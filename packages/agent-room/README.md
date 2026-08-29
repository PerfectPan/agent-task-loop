# @rivus/agent-room

Shared **posted stream**, per-agent session, and write-point HELD.

This package does not know tasks, occupancy seats, Feishu, or ReviewLoop.
Callers inject the capability port for the slice they use. `rivus-agent` is the first live adapter.

See RFC 0010 Chapter B.

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
