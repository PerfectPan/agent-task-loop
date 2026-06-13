import type { SessionRecord } from "../sessions/session-record.js";

export function formatSessionRecordLine(session: SessionRecord): string {
  return [session.updatedAt, session.agent, session.id, session.title, session.path].join("\t");
}
