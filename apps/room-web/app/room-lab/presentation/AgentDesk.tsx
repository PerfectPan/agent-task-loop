import { Form, Link } from '@remix-run/react';
import type { AgentDeskView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentAvailabilityLabels } from './agent-availability';
import { agentRoleLabels } from './agent-role';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

export function AgentDesk({ desk }: { desk: AgentDeskView }) {
  const backTo = desk.lastOpenedId ? `/room/${desk.lastOpenedId}` : '/room';
  const runnable = desk.agents.filter(agent => agent.availability === 'runnable').length;
  return (
    <main className="min-h-dvh bg-paper bg-[url('/images/garden.jpg')] bg-cover bg-center px-4 py-10 font-sans text-ink">
      <section className="mx-auto w-[min(760px,100%)] rounded-[10px] border border-line/80 bg-washi/90 p-6">
        <p className="mb-1.5 text-xs text-muted">本地协作</p>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold">智能体管理</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              这台机器上的 CLI：{runnable} 个可运行 / {desk.agents.length} 个席位。入座在房间成员里改。
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={backTo} className={cn(buttonVariants({ variant: 'outline' }))}>回房间</Link>
            <Form method="post">
              <Button type="submit" variant="outline">重新扫描</Button>
            </Form>
          </div>
        </div>
        <ul className="flex flex-col gap-2" aria-label="本机智能体">
          {desk.agents.map(agent => (
            <li key={agent.id} className="flex items-start gap-3 rounded-[10px] border border-line bg-washi px-3 py-3">
              <AgentAvatar agentId={agent.id} className="size-12 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{agent.label}</strong>
                  <Badge variant={agent.availability}>{agentAvailabilityLabels[agent.availability]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{agentRoleLabels[agent.id]}</p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-ink/80 [overflow-wrap:anywhere]">
                  {agent.command ?? 'PATH 上没有对应命令'}
                  {agent.version ? ` · ${agent.version}` : ''}
                </p>
                {agent.seatedIn.length > 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    已入座：
                    {agent.seatedIn.map((room, index) => (
                      <span key={room.id}>
                        {index > 0 ? '、' : ''}
                        <Link className="text-moss-deep underline" to={`/room/${room.id}`}>{room.title}</Link>
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">还没有入座任何房间</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
