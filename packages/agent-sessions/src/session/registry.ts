import type { Session } from "./types.js";
import type { TranscriptEntry } from "../transcript/types.js";
import {
  claudeProvider,
  codexProvider,
  type ListOptions,
  type ProviderFactoryOptions,
  type SessionProvider
} from "./provider.js";

/**
 * Aggregates per-tool {@link SessionProvider}s into one cross-tool view:
 * `list` merges and sorts newest-first, `getTranscript` / `resumeCommand`
 * delegate to the first provider that can serve the id.
 */
export class SessionRegistry {
  constructor(private readonly providers: SessionProvider[]) {}

  /** The underlying providers, in priority order. */
  getProviders(): SessionProvider[] {
    return this.providers;
  }

  async list(opts?: ListOptions): Promise<Session[]> {
    const perProvider = await Promise.all(this.providers.map((p) => p.list(opts)));
    return perProvider.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTranscript(id: string, maxLines?: number): Promise<TranscriptEntry[]> {
    for (const provider of this.providers) {
      const transcript = await provider.getTranscript(id, maxLines);
      if (transcript.length > 0) return transcript;
    }
    return [];
  }

  async resumeCommand(id: string): Promise<string | null> {
    for (const provider of this.providers) {
      const command = await provider.resumeCommand(id);
      if (command) return command;
    }
    return null;
  }
}

/** Registry of the default filesystem-backed providers (Codex + Claude). */
export function defaultRegistry(opts?: ProviderFactoryOptions): SessionRegistry {
  return new SessionRegistry([codexProvider(opts), claudeProvider(opts)]);
}
