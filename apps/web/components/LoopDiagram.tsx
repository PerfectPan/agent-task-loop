import { STAGES } from '../lib/content';

export function LoopDiagram() {
  return (
    <section id="loop" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One loop, end to end</h2>
        <p className="mt-3 text-muted">
          Every task flows through the same pipeline. Agents pick up work, do it, get reviewed, and
          iterate until it&apos;s ready to ship.
        </p>
      </div>

      <ol className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        {STAGES.map((stage, i) => (
          <li key={stage.en} className="flex items-center gap-3 sm:flex-col sm:gap-0">
            <div className="flex w-full flex-col rounded-xl border border-border bg-surface px-4 py-3 text-center transition hover:border-accent/50 sm:w-36">
              <span className="font-mono text-lg font-semibold text-accent">{stage.label}</span>
              <span className="text-sm font-medium">{stage.en}</span>
              <span className="mt-1 text-xs text-muted">{stage.desc}</span>
            </div>
            {i < STAGES.length - 1 && (
              <span className="text-accent/60 sm:my-0 sm:mx-1" aria-hidden>
                <span className="hidden sm:inline">→</span>
                <span className="sm:hidden">↓</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
