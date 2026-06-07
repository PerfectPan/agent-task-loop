import { CopyButton } from './CopyButton';
import { NPM_PACKAGE } from '../lib/data';

export function Hero({ version, repoUrl }: { version: string; repoUrl: string }) {
  const install = `npx ${NPM_PACKAGE} tui --demo`;
  return (
    <section id="top" className="hero-grid border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Open source · GPL-3.0 · v{version}
        </a>

        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Drive AI coding agents
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            {' '}from task to PR
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted sm:text-lg">
          A local CLI and terminal dashboard that runs your coding agents through the full loop —
          execution, review, rework, and a publish-ready pull request. Pluggable task backends,
          multi-agent ready.
        </p>

        <div className="mx-auto mt-8 flex max-w-xl items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3 font-mono text-sm">
          <code className="truncate text-left">
            <span className="select-none text-muted">$ </span>
            {install}
          </code>
          <CopyButton text={install} />
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <a
            href="#install"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90"
          >
            Get started
          </a>
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-fg transition hover:border-accent/50"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
