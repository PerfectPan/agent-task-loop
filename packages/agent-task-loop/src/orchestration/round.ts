import {
  harvestMail,
  stitchInbox,
  type ChannelEntry,
  type Orchestration,
  type RunSnapshot,
  type SpawnPermit,
} from '@rivus/agent-orchestration';

export function ensureToken(orch: Orchestration, key: string, seat: string): RunSnapshot {
  const snapshot = orch.snapshot({ key });
  if (snapshot.tokens.some(token => token.seat === seat)) {
    return snapshot;
  }
  const holder = snapshot.tokens[0];
  if (holder) {
    return orch.pass({ key, from: holder.seat, to: seat, expectedTerm: snapshot.term });
  }
  return orch.grant({ key, seat, expectedTerm: snapshot.term });
}

export function authorizeSeat(orch: Orchestration, key: string, seat: string): SpawnPermit {
  const held = ensureToken(orch, key, seat);
  return orch.authorizeSpawn({ key, seat, expectedTerm: held.term });
}

export function harvestImplMailIfNeeded(
  orch: Orchestration,
  key: string,
  transcript: string,
  sinceIndex: number,
): ChannelEntry[] {
  if (hasMailSince(orch, key, sinceIndex, 'impl')) {
    return [];
  }
  const harvested = harvestMail(transcript);
  return harvested.map(mail =>
    orch.send({
      key,
      from: 'impl',
      to: mail.to,
      mailKind: mail.mailKind,
      body: encodeBody(mail.body),
    }),
  );
}

export function wrapReviewVerdictIfNeeded(
  orch: Orchestration,
  key: string,
  review: { verdict: string; findings: string },
  sinceIndex: number,
): ChannelEntry | undefined {
  if (hasMailSince(orch, key, sinceIndex, 'review', 'review-verdict')) {
    return undefined;
  }
  return orch.send({
    key,
    from: 'review',
    to: 'impl',
    mailKind: 'review-verdict',
    body: JSON.stringify({ verdict: review.verdict, findings: review.findings }),
  });
}

export function readReviewInbox(orch: Orchestration, key: string): {
  suffix?: string;
  markRead: () => void;
} {
  const entries = orch.inbox({ key, seat: 'review' });
  if (entries.length === 0) {
    return { markRead() {} };
  }
  return {
    suffix: stitchInbox('', entries),
    markRead() {
      orch.inbox({ key, seat: 'review', markRead: true });
    },
  };
}

function hasMailSince(
  orch: Orchestration,
  key: string,
  sinceIndex: number,
  fromSeat: string,
  mailKind?: string,
): boolean {
  return orch.channel({ key, fromIndex: sinceIndex + 1 }).entries.some(
    entry =>
      entry.kind === 'mail' &&
      entry.fromSeat === fromSeat &&
      (mailKind === undefined || entry.mailKind === mailKind),
  );
}

function encodeBody(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body);
}
