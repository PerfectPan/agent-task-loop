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
    expect(conversation.shouldWake(broadcast.event, 'codex')).toBe(true);
    expect(conversation.shouldWake(broadcast.event, 'dsh')).toBe(true);

    const directed = await conversation.admitHuman({
      messageId: 'directed',
      body: '@dsh 请挑战这个结论',
      addressedTo: ['dsh'],
    });
    expect(conversation.shouldWake(directed.event, 'dsh')).toBe(true);
    expect(conversation.shouldWake(directed.event, 'codex')).toBe(false);
  });

  it('hands a member the whole room, including what that member said itself', async () => {
    const conversation = new MemoryRoomConversation();
    await conversation.admitHuman({ messageId: 'web:1', body: '先聊定价', addressedTo: [] });
    await conversation.prepareTurn('codex');
    await conversation.reply({ agentId: 'codex', body: '我的方案 A：按用量计费。' });
    await conversation.admitHuman({ messageId: 'web:2', body: '把刚才的方案再说一遍', addressedTo: [] });

    const context = await conversation.prepareTurn('codex');

    // The point of the change: its own answer is in its next turn, and so is
    // the message that came before it.
    expect(context.map(event => event.seq)).toEqual([1, 2, 3]);
    expect(context.map(event => event.body)).toEqual([
      '先聊定价',
      '我的方案 A：按用量计费。',
      '把刚才的方案再说一遍',
    ]);
    expect(context.find(event => event.author.id === 'codex')?.body)
      .toBe('我的方案 A：按用量计费。');
    // The cursor keeps only its other job, and still points at head.
    expect(conversation.inspectAgent('codex').seenSeq).toBe(3);
  });

  it('gives every member the same room, not each one its own unread mail', async () => {
    const conversation = new MemoryRoomConversation();
    await conversation.admitHuman({ messageId: 'web:1', body: '开场', addressedTo: [] });
    await conversation.prepareTurn('codex');
    await conversation.reply({ agentId: 'codex', body: 'codex 说的话' });
    await conversation.prepareTurn('dsh');
    await conversation.reply({ agentId: 'dsh', body: 'dsh 说的话' });

    const forCodex = await conversation.prepareTurn('codex');
    const forDsh = await conversation.prepareTurn('dsh');

    expect(forCodex.map(event => event.body)).toEqual(['开场', 'codex 说的话', 'dsh 说的话']);
    expect(forDsh.map(event => event.body)).toEqual(forCodex.map(event => event.body));
    expect(conversation.inspectAgent('codex').seenSeq).toBe(3);
    expect(conversation.inspectAgent('dsh').seenSeq).toBe(3);
  });

  it('keeps the newest events when the room is longer than the turn budget', async () => {
    const conversation = new MemoryRoomConversation();
    for (let index = 1; index <= 60; index += 1) {
      await conversation.admitHuman({ messageId: `web:${index}`, body: `第 ${index} 条`, addressedTo: [] });
    }

    const context = await conversation.prepareTurn('codex');

    // The budget cuts the oldest, never the newest: a member reads the end of
    // the conversation, which is the part it has to answer.
    expect(context).toHaveLength(50);
    expect(context.at(0)?.seq).toBe(11);
    expect(context.at(-1)?.seq).toBe(60);
    expect(context.at(-1)?.body).toBe('第 60 条');
    // Behind-ness is still measured against head, not against what fit.
    expect(conversation.inspectAgent('codex').seenSeq).toBe(60);
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
