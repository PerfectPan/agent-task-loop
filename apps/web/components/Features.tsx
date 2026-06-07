import { FEATURES } from '../lib/content';

const GLYPH: Record<string, string> = {
  loop: '⟲',
  plug: '⊕',
  terminal: '▤',
  agents: '◇',
  search: '⌕',
  ci: '⚙',
};

export function Features() {
  return (
    <section id="features" className="border-y border-border/60 bg-surface/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything the loop needs</h2>
          <p className="mt-3 text-muted">
            A focused toolkit for running coding agents reliably — not another chat wrapper.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(feature => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/40 hover:bg-surface-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg text-lg text-accent transition group-hover:border-accent/50">
                {GLYPH[feature.icon] ?? '◆'}
              </div>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
