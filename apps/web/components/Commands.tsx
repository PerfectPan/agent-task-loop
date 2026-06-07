import { COMMANDS } from '../lib/content';
import { NPM_PACKAGE } from '../lib/data';
import { CopyButton } from './CopyButton';

export function Commands() {
  return (
    <section id="install" className="border-y border-border/60 bg-surface/30">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Up and running in seconds</h2>
          <p className="mt-3 text-muted">No install step — run it straight from npm with npx.</p>
        </div>

        <div className="mt-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-[#07090d] px-4 py-3 font-mono text-sm">
          <code>
            <span className="select-none text-muted">$ </span>
            npx {NPM_PACKAGE} --help
          </code>
          <CopyButton text={`npx ${NPM_PACKAGE} --help`} />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
          {COMMANDS.map((c, i) => (
            <div
              key={c.cmd}
              className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                i > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <code className="font-mono text-sm">
                <span className="text-muted">agent-task-loop </span>
                <span className="text-accent">{c.cmd}</span>
              </code>
              <span className="text-sm text-muted">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
