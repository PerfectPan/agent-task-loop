import { execFileSync } from 'node:child_process';

/** Best-effort `gh repo view` lookup to prefill owner/repo. Returns undefined on any failure. */
export function detectGitHubRepo(): { owner: string; repo: string } | undefined {
  try {
    const out = execFileSync('gh', ['repo', 'view', '--json', 'owner,name'], { encoding: 'utf8' });
    const parsed = JSON.parse(out) as { owner?: { login?: string }; name?: string };
    if (parsed.owner?.login && parsed.name) {
      return { owner: parsed.owner.login, repo: parsed.name };
    }
  } catch {
    // gh missing or not in a repo — fall through to manual entry.
  }
  return undefined;
}
