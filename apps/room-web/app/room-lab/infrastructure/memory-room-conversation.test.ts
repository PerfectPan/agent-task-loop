import { describe, expect, it } from 'vitest';
import { MemoryRoomConversation } from './memory-room-conversation.server';

describe('MemoryRoomConversation', () => {
  it('broadcasts unmentioned messages and makes explicit mentions exclusive', async () => {
    const conversation = new MemoryRoomConversation();
    const broadcast = await conversation.admitHuman({
      messageId: 'broadcast',
      body: '大家一起讨论',
      addressedTo: [],
    });
    expect(conversation.shouldWake(broadcast, 'codex')).toBe(true);
    expect(conversation.shouldWake(broadcast, 'dsh')).toBe(true);

    const directed = await conversation.admitHuman({
      messageId: 'directed',
      body: '@dsh 请挑战这个结论',
      addressedTo: ['dsh'],
    });
    expect(conversation.shouldWake(directed, 'dsh')).toBe(true);
    expect(conversation.shouldWake(directed, 'codex')).toBe(false);
  });

  it('never advances the session beyond events that fit the context budget', async () => {
    const conversation = new MemoryRoomConversation();
    await conversation.project({
      type: 'seat-output',
      seat: 'impl',
      body: 'x'.repeat(48_001),
      latencyMs: 1,
      task: {
        taskId: 'WEB-001',
        title: 'Oversized projection',
        status: 'reviewing',
        round: 1,
        maxRounds: 2,
        implementation: 'x',
      },
    });

    await expect(conversation.prepareTurn('codex')).rejects.toThrow('exceeds the agent context budget');
    expect(conversation.inspectAgent('codex').seenSeq).toBe(0);
  });

  it('paginates HELD catch-up within the retry budget and preserves the cursor', async () => {
    const conversation = new MemoryRoomConversation();
    for (const index of [1, 2, 3]) {
      await conversation.project({
        type: 'seat-output',
        seat: 'impl',
        body: `${index}:${'x'.repeat(20_000)}`,
        latencyMs: 1,
        task: {
          taskId: `WEB-00${index}`,
          title: 'Bounded projection',
          status: 'reviewing',
          round: 1,
          maxRounds: 2,
          implementation: 'x',
        },
      });
    }
    const held = await conversation.reply({ agentId: 'claude', body: 'draft' });
    expect(held).toMatchObject({ outcome: 'held', heldUpToSeq: 3 });
    if (held.outcome !== 'held') return;

    const first = await conversation.prepareHeldRetry('claude', held.heldUpToSeq);
    expect(first).toMatchObject({ caughtUp: false, consumedUpToSeq: 1, events: [{ seq: 1 }] });
    expect(conversation.inspectAgent('claude').seenSeq).toBe(0);
    conversation.advanceHeldRetry('claude', first.consumedUpToSeq);
    expect(conversation.inspectAgent('claude').seenSeq).toBe(1);
    const second = await conversation.prepareHeldRetry('claude', held.heldUpToSeq);
    expect(second).toMatchObject({ caughtUp: false, consumedUpToSeq: 2, events: [{ seq: 2 }] });
    conversation.advanceHeldRetry('claude', second.consumedUpToSeq);
    const third = await conversation.prepareHeldRetry('claude', held.heldUpToSeq);
    expect(third).toMatchObject({ caughtUp: true, consumedUpToSeq: 3, events: [{ seq: 3 }] });
    conversation.advanceHeldRetry('claude', third.consumedUpToSeq);
    expect(conversation.inspectAgent('claude').seenSeq).toBe(3);
  });
});
