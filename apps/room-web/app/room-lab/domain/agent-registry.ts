/**
 * Every member of every Room is a row in `agents`. There is no built-in member
 * and no custom one: the code knows the shape of a definition and nothing about
 * any particular agent's name. An id is also the word after `@`, which is why it
 * is restricted to the mention grammar.
 */
export type RoomLabAgentId = string;

export interface AgentDefinition {
  id: string;
  label: string;
  role: string;
  /** One shell command; the runner executes `zsh -lic '<command> "$1"'`. */
  command: string;
  /**
   * What this member is told about how to behave, prepended to every turn it
   * takes. Empty means the turn carries the room's facts and nothing else.
   */
  systemPrompt: string;
  /** 1…5, the identity hue, drawn at random when the row is created. */
  color: number;
  position: number;
}

export const AGENT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The identity ramp is shadcn's own five categorical colours. */
export const AGENT_COLOR_COUNT = 5;

/** What the domain needs from a registry: which ids exist, and in what order. */
export interface KnownAgentIds {
  has(id: string): boolean;
  ids(): string[];
}

export function isAgentId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_ID_PATTERN.test(value);
}

export class AgentRegistry implements KnownAgentIds {
  private definitions: AgentDefinition[] = [];

  constructor(private readonly load: () => readonly AgentDefinition[] = () => []) {
    this.reload();
  }

  /** A static registry, for tests and for callers that already hold the rows. */
  static of(definitions: readonly AgentDefinition[]): AgentRegistry {
    return new AgentRegistry(() => definitions);
  }

  /** Re-reads the table and replaces the in-memory rows. */
  reload(): void {
    this.definitions = [...this.load()]
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map(clone);
  }

  list(): AgentDefinition[] {
    return this.definitions.map(clone);
  }

  get(id: string): AgentDefinition | undefined {
    const found = this.definitions.find(agent => agent.id === id);
    return found ? clone(found) : undefined;
  }

  has(id: string): boolean {
    return this.definitions.some(agent => agent.id === id);
  }

  ids(): string[] {
    return this.definitions.map(agent => agent.id);
  }

  get size(): number {
    return this.definitions.length;
  }
}

function clone(definition: AgentDefinition): AgentDefinition {
  return { ...definition };
}
