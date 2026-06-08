import { GitHubIcon, NpmIcon } from './icons';

export function Nav({ version, repoUrl, npmUrl }: { version: string; repoUrl: string; npmUrl: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-mono text-sm font-semibold">
          <span className="text-accent">◆</span>
          <span>agent-task-loop</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
            v{version}
          </span>
        </a>
        <div className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <a href="#features" className="transition hover:text-fg">Features</a>
          <a href="#loop" className="transition hover:text-fg">How it works</a>
          <a href="#tui" className="transition hover:text-fg">TUI</a>
          <a href="#install" className="transition hover:text-fg">Install</a>
        </div>
        <div className="flex items-center gap-3">
          <a href={npmUrl} target="_blank" rel="noreferrer" aria-label="npm" className="text-muted transition hover:text-fg">
            <NpmIcon className="h-5 w-5" />
          </a>
          <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="GitHub" className="text-muted transition hover:text-fg">
            <GitHubIcon className="h-5 w-5" />
          </a>
        </div>
      </nav>
    </header>
  );
}
