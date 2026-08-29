# @rivus/agent-room

Shared **posted stream**, per-agent session, and write-point HELD.

This package does not know tasks, occupancy seats, Feishu, or ReviewLoop.
Callers inject a `RoomStreamStore`. `rivus-agent` is the first live adapter.

See RFC 0010 Chapter B.

## Status

Internal package (`private: true`). Not published yet.

**1a — port + memory `admit`**
- `RoomStreamStore` port
- `createMemoryRoomStreamStore()`
- `admit` is idempotent on transport `message_id`
- `head` returns the last posted seq (0 if empty)
- `readSlice` / `replyInSerial` land in later slices

## Non-mixing

Occupancy `allow(seat)` is not a chat reservation. Room HELD is not `task-start`
exclusion. Do not import `@rivus/agent-orchestration` or `@rivus/agent-task-loop`.
