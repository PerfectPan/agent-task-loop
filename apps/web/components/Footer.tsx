import { GitHubIcon, NpmIcon } from './icons';

export function Footer({ repoUrl, npmUrl }: { repoUrl: string; npmUrl: string }) {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:px-6">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-accent">◆</span>
          <span>agent-task-loop</span>
          <span className="text-muted/60">· GPL-3.0</span>
        </div>
        <div className="flex items-center gap-5">
          <a href={`${repoUrl}/tree/main/rfcs`} target="_blank" rel="noreferrer" className="transition hover:text-fg">
            RFCs
          </a>
          <a href={`${repoUrl}#readme`} target="_blank" rel="noreferrer" className="transition hover:text-fg">
            Docs
          </a>
          <a href={npmUrl} target="_blank" rel="noreferrer" aria-label="npm" className="transition hover:text-fg">
            <NpmIcon className="h-4 w-4" />
          </a>
          <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="GitHub" className="transition hover:text-fg">
            <GitHubIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
