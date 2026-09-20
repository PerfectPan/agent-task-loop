-- A member's behaviour is metadata about that member, so it lives on its row
-- next to the command that runs it. The column is NOT NULL: every row has a
-- system prompt, an empty one meaning "add nothing to the turn".
-- The data half — moving what agent_system_prompts held, seeding a default for
-- the rest, and retiring the old table — is in 0003_agent_system_prompt.seed.ts,
-- because it has to run after this column exists and before the old table goes.

ALTER TABLE agents ADD COLUMN system_prompt TEXT NOT NULL DEFAULT '';
