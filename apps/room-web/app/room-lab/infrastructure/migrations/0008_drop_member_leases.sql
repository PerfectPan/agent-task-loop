-- 0008: the member lease store goes. Leases moved to
-- `@rivus/agent-kit-collab`'s `/lease` (SQLite repository), which keeps its own
-- database file next to this library. `member_leases` was one process's lease
-- rows; a lease is ephemeral by design, so there is nothing to carry over.

DROP TABLE member_leases;
