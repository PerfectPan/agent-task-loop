/**
 * Real project data, fetched at build time (ISR, hourly revalidate) from the
 * public npm registry and GitHub API. Every fetch degrades gracefully so a
 * build without network never fails — it just falls back to last-known values.
 */

const NPM_PKG = '@rivus/agent-task-loop';
const GH_REPO = 'PerfectPan/agent-task-loop';

export interface ProjectStats {
  version: string;
  monthlyDownloads: number | null;
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  repoUrl: string;
  npmUrl: string;
}

const REVALIDATE = 3600;

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getProjectStats(): Promise<ProjectStats> {
  const [registry, downloads, repo] = await Promise.all([
    getJson<{ 'dist-tags'?: { latest?: string } }>(`https://registry.npmjs.org/${encodeURIComponent(NPM_PKG)}`),
    getJson<{ downloads?: number }>(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(NPM_PKG)}`),
    getJson<{ stargazers_count?: number; forks_count?: number; open_issues_count?: number }>(
      `https://api.github.com/repos/${GH_REPO}`,
      { Accept: 'application/vnd.github+json' },
    ),
  ]);

  return {
    version: registry?.['dist-tags']?.latest ?? '0.4.0',
    monthlyDownloads: downloads?.downloads ?? null,
    stars: repo?.stargazers_count ?? null,
    forks: repo?.forks_count ?? null,
    openIssues: repo?.open_issues_count ?? null,
    repoUrl: `https://github.com/${GH_REPO}`,
    npmUrl: `https://www.npmjs.com/package/${NPM_PKG}`,
  };
}

export const NPM_PACKAGE = NPM_PKG;
