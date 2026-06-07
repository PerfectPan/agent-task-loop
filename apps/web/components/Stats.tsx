import type { ProjectStats } from '../lib/data';

function fmt(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function Stats({ stats }: { stats: ProjectStats }) {
  const items = [
    { label: 'Latest version', value: `v${stats.version}` },
    { label: 'Downloads / mo', value: fmt(stats.monthlyDownloads) },
    { label: 'GitHub stars', value: fmt(stats.stars) },
    { label: 'Forks', value: fmt(stats.forks) },
  ];
  return (
    <section className="border-b border-border/60 bg-surface/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/60 px-4 sm:grid-cols-4 sm:px-6">
        {items.map(item => (
          <div key={item.label} className="px-4 py-6 text-center">
            <div className="font-mono text-2xl font-bold text-accent sm:text-3xl">{item.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-muted">{item.label}</div>
          </div>
        ))}
      </div>
      <p className="pb-4 text-center text-[11px] text-muted/70">Live from the npm registry & GitHub API</p>
    </section>
  );
}
