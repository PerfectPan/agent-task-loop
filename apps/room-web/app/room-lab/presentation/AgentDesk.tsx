import { useState } from 'react';
import { Form, Link, useNavigation } from '@remix-run/react';
import type { AgentDeskView, RoomLabAgentId } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentAvailabilityLabels } from './agent-availability';
import { agentRoleLabels } from './agent-role';
import { PRODUCT_NAME } from './product';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';

export function AgentDesk({ desk }: { desk: AgentDeskView }) {
  const backTo = desk.lastOpenedId ? `/room/${desk.lastOpenedId}` : '/room';
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const preferred = desk.agents.find(agent => agent.availability === 'runnable')?.id
    ?? desk.agents[0]?.id;
  const [selected, setSelected] = useState<RoomLabAgentId | undefined>(preferred);
  const current = desk.agents.find(agent => agent.id === selected) ?? desk.agents[0];
  const runnable = desk.agents.filter(agent => agent.availability === 'runnable').length;
  return (
    <main className="min-h-dvh bg-paper bg-[url('/images/garden.jpg')] bg-cover bg-center px-4 py-10 font-sans text-ink">
      <section className="mx-auto w-[min(760px,100%)] rounded-[10px] border border-line/80 bg-washi/90 p-6">
        <p className="mb-1.5 text-xs text-muted">{PRODUCT_NAME}</p>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold">智能体</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              为每个智能体写系统提示。房间里叫到它时会带上。{runnable} 个可运行 / {desk.agents.length} 个席位。
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={backTo} className={cn(buttonVariants({ variant: 'outline' }))}>回房间</Link>
            <Form method="post">
              <input type="hidden" name="intent" value="scan" />
              <Button type="submit" variant="outline" disabled={busy}>重新扫描</Button>
            </Form>
          </div>
        </div>
        <ul className="flex flex-col gap-2" aria-label="本机智能体">
          {desk.agents.map(agent => (
            <li
              key={agent.id}
              className={cn(
                'rounded-[10px] border bg-washi px-3 py-3',
                current?.id === agent.id ? 'border-moss' : 'border-line',
              )}
            >
              <div
                role="option"
                aria-selected={current?.id === agent.id}
                tabIndex={0}
                className="flex w-full cursor-pointer items-start gap-3 text-left"
                onClick={() => setSelected(agent.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(agent.id);
                  }
                }}
              >
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
                </div>
              </div>
              {agent.seatedIn.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  已入座：
                  {agent.seatedIn.map((room, index) => (
                    <span key={room.id}>
                      {index > 0 ? '、' : ''}
                      <Link className="text-moss-deep underline" to={`/room/${room.id}`}>{room.title}</Link>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">还没有入座任何房间</p>
              )}
            </li>
          ))}
        </ul>
        {current && (
          <Form method="post" className="mt-4 rounded-[10px] border border-line bg-washi p-3">
            <input type="hidden" name="intent" value="save-prompt" />
            <input type="hidden" name="agentId" value={current.id} />
            <label className="mb-2 block text-sm" htmlFor="agent-system-prompt">
              {current.label} 的系统提示
            </label>
            <Textarea
              key={current.id}
              id="agent-system-prompt"
              name="systemPrompt"
              rows={6}
              maxLength={4000}
              disabled={busy}
              defaultValue={current.systemPrompt ?? ''}
              placeholder="给这个智能体的常驻说明。空着则不改调用方式。"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">保存在这台机器上，所有房间共用。</p>
              <Button type="submit" disabled={busy}>保存</Button>
            </div>
          </Form>
        )}
      </section>
    </main>
  );
}
