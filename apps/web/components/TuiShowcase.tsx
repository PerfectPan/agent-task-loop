const ROWS: { glyph: string; color: string; id: string; title: string; pri: string; sel?: boolean }[] = [
  { glyph: '●', color: 'text-emerald-400', id: 'TASK-101', title: 'Wire task provider boundary', pri: 'P3', sel: true },
  { glyph: '●', color: 'text-amber-400', id: 'TASK-102', title: '修复并发认领的竞态条件', pri: 'P2' },
  { glyph: '◎', color: 'text-cyan-400', id: 'TASK-104', title: 'Migrate logging to JSON', pri: 'P2' },
  { glyph: '↑', color: 'text-blue-400', id: 'TASK-107', title: 'Publish provider abstraction', pri: 'P2' },
  { glyph: '◉', color: 'text-amber-400', id: 'TASK-103', title: 'Add session preview pane', pri: 'P1' },
  { glyph: '◌', color: 'text-gray-500', id: 'TASK-106', title: 'Set up E2E pipeline', pri: 'P3' },
];

function Dot({ c }: { c: string }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${c}`} />;
}

export function TuiShowcase() {
  return (
    <section id="tui" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A dashboard in your terminal</h2>
        <p className="mt-3 text-muted">
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-accent">tui</code> opens a
          three-pane view: tasks, detail, and a live agent-session preview. Vim keys, live status, zero mouse.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-xl border border-border bg-[#07090d] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
          <Dot c="bg-red-500/80" />
          <Dot c="bg-amber-500/80" />
          <Dot c="bg-emerald-500/80" />
          <span className="ml-2 font-mono text-xs text-muted">agent-task-loop tui</span>
        </div>

        <div className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
          <div className="min-w-[640px]">
            {/* header */}
            <div className="rounded border border-cyan-500/40 px-3 py-1">
              <span className="font-bold text-cyan-300">Agent Task Loop</span>{' '}
              <span className="text-emerald-400">claude</span> <span className="text-amber-400">10</span>{' '}
              <span className="text-muted">updated 4s ago</span>
            </div>
            {/* tabs */}
            <div className="mt-1 flex gap-3 px-1 text-xs">
              <span className="rounded bg-cyan-400 px-2 font-semibold text-bg">Active(6)</span>
              <span className="text-muted">Needs Input(2)</span>
              <span className="text-muted">Done(2)</span>
              <span className="text-muted">All(10)</span>
            </div>
            {/* panes */}
            <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-[1.4fr_1fr_1fr]">
              {/* list */}
              <div className="rounded border border-cyan-500/50 p-2">
                <div className="font-bold text-cyan-300">tasks (6)</div>
                {ROWS.map(r => (
                  <div key={r.id} className={r.sel ? 'flex items-center gap-1 bg-cyan-500/10' : 'flex items-center gap-1'}>
                    <span className="w-3 text-accent">{r.sel ? '❯' : ' '}</span>
                    <span className={r.color}>{r.glyph}</span>
                    <span className="text-cyan-400">{r.id}</span>
                    <span className={r.sel ? 'flex-1 truncate font-semibold' : 'flex-1 truncate text-fg/80'}>{r.title}</span>
                    <span className="text-muted">{r.pri}</span>
                  </div>
                ))}
              </div>
              {/* detail */}
              <div className="rounded border border-border/70 p-2 text-muted">
                <div className="font-bold text-fg/80">detail</div>
                <div className="mt-1 font-semibold text-fg">TASK-101 Wire task provider…</div>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3">
                  <span>状态</span><span className="text-emerald-400">执行中</span>
                  <span>Agent</span><span className="text-fg/80">claude</span>
                  <span>项目</span><span className="text-fg/80">agent-task-loop</span>
                  <span>更新</span><span className="text-fg/80">8s ago</span>
                </div>
              </div>
              {/* preview */}
              <div className="rounded border border-border/70 p-2 text-muted">
                <div>
                  <span className="font-semibold text-cyan-300">▸output</span> ·history ·logs
                </div>
                <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2">
                  <span>name</span><span className="text-fg/80">execution-claude-r2</span>
                  <span>runner</span><span className="text-fg/80">execute · claude</span>
                  <span>heartbeat</span>
                  <span className="text-emerald-400">● 4s ago (fresh) <span className="cursor-blink">⠙</span> live</span>
                </div>
                <div className="mt-2 text-fg/70">
                  <div>12:00:03 sort.test.ts ✓</div>
                  <div>12:00:05 12 passed</div>
                </div>
              </div>
            </div>
            {/* footer */}
            <div className="mt-1 px-1 text-xs text-muted">
              [↑↓/jk] nav  [Tab] focus  [Enter] attach  [/] filter  [?] help  [q] quit
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
