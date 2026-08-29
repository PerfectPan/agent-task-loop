import { describe, expect, it } from 'vitest';
import { shouldWake, type RoomEvent } from '../src/index';

const room = { tenantId: 't1', conversationId: 'c1' };

function event(overrides: Partial<RoomEvent>): RoomEvent {
  return {
    seq: 1,
    roomId: room,
    messageId: 'm1',
    author: { kind: 'human', id: 'alice' },
    kind: 'human',
    body: 'hello',
    origin: 'endpoint',
    addressedTo: [],
    at: '2026-08-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('shouldWake', () => {
  it('wakes on an @mention under either policy', () => {
    const mentioned = event({ addressedTo: ['bot-a'] });
    expect(shouldWake({ event: mentioned, agentId: 'bot-a', policy: 'mention-only' })).toBe(true);
    expect(shouldWake({ event: mentioned, agentId: 'bot-a', policy: 'all-human-messages' })).toBe(
      true,
    );
    expect(shouldWake({ event: mentioned, agentId: 'bot-b', policy: 'mention-only' })).toBe(false);
    expect(shouldWake({ event: mentioned, agentId: 'bot-b', policy: 'all-human-messages' })).toBe(
      true,
    );
  });

  it('wakes on unmentioned human posts only for all-human-messages', () => {
    const human = event({});
    expect(shouldWake({ event: human, agentId: 'bot-a', policy: 'mention-only' })).toBe(false);
    expect(shouldWake({ event: human, agentId: 'bot-a', policy: 'all-human-messages' })).toBe(true);
  });

  it('does not wake on companion posts, own posts, or control-plane', () => {
    expect(
      shouldWake({
        event: event({
          kind: 'companion',
          author: { kind: 'agent', id: 'bot-b' },
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({
          kind: 'posted',
          author: { kind: 'agent', id: 'bot-a' },
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({
          kind: 'posted',
          author: { kind: 'agent', id: 'bot-b' },
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({
          kind: 'companion',
          author: { kind: 'agent', id: 'bot-b' },
          addressedTo: ['bot-a'],
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({
          kind: 'control-plane',
          origin: 'control-plane',
          author: { kind: 'control-plane', id: 'host' },
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({
          author: { kind: 'control-plane', id: 'host' },
          addressedTo: ['bot-a'],
        }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
  });

  it('does not wake for inconsistent author and event classifications', () => {
    expect(
      shouldWake({
        event: event({ kind: 'posted', addressedTo: ['bot-a'] }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
    expect(
      shouldWake({
        event: event({ author: { kind: 'agent', id: 'bot-b' }, addressedTo: ['bot-a'] }),
        agentId: 'bot-a',
        policy: 'all-human-messages',
      }),
    ).toBe(false);
  });
});
