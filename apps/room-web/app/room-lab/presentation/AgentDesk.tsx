import { useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import type { AgentDeskView, RoomLabAgentId } from '../read-model';
import { AgentMark, RiverMark } from './AgentMark';
import { agentAvailabilityLabels } from './agent-availability';
import { agentRoleLabels } from './agent-role';
import { PRODUCT_NAME } from './product';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { sectionLabel } from './ui';

const availabilityVariant = {
  runnable: 'info',
  found: 'warning',
  missing: 'muted',
} as const;

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
    <main className="min-h-dvh bg-background px-4 py-8 font-sans text-foreground">
      <div className="mx-auto w-[min(760px,100%)]">
        <div className="mb-4 flex items-center gap-2 px-1">
          <RiverMark size={18} />
          <strong className="text-sm font-semibold tracking-[-0.01em] leading-none">{PRODUCT_NAME}</strong>
          <span className="text-xs leading-none text-muted-foreground">本地工作台</span>
        </div>
        <section className="rounded-lg border border-input bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-7 pt-[22px] pb-3.5">
            <div>
              <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.02em]">智能体</h1>
              <p className="mt-1 mb-0 text-sm leading-snug text-foreground/75">
                这台机器上 {runnable} 位能跑，共 {desk.agents.length} 位。给每位写常驻提示，房间里叫到它时会带上。
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to={backTo} className="no-underline">回房间</Link>
              </Button>
              <Form method="post">
                <input type="hidden" name="intent" value="scan" />
                <Button type="submit" variant="outline" disabled={busy}>重新扫描</Button>
              </Form>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] max-[720px]:grid-cols-1">
            <ul className="m-0 flex list-none flex-col p-0 border-r border-border max-[720px]:border-r-0 max-[720px]:border-b" aria-label="本机智能体">
              {desk.agents.map(agent => {
                const active = current?.id === agent.id;
                return (
                  <li key={agent.id} className="border-b border-border last:border-b-0">
                    <div
                      role="option"
                      aria-selected={active}
                      tabIndex={0}
                      className={`flex w-full cursor-pointer items-start gap-3 px-[18px] py-3 text-left transition-colors duration-150 hover:bg-accent ${active ? 'bg-primary/10' : ''}`}
                      onClick={() => setSelected(agent.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelected(agent.id);
                        }
                      }}
                    >
                      <AgentMark agentId={agent.id} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-medium">{agent.label}</strong>
                          <Badge variant={availabilityVariant[agent.availability]}>{agentAvailabilityLabels[agent.availability]}</Badge>
                        </div>
                        <p className="m-0 mt-0.5 text-xs text-muted-foreground">{agentRoleLabels[agent.id]}</p>
                        <p className="m-0 mt-1 font-mono text-xs leading-relaxed text-foreground/75 [overflow-wrap:anywhere]">
                          {agent.command ?? 'PATH 上没有对应命令'}
                          {agent.version ? ` · ${agent.version}` : ''}
                        </p>
                        {agent.seatedIn.length > 0 ? (
                          <p className="m-0 mt-1.5 text-xs text-muted-foreground">
                            在这些房间里：
                            {agent.seatedIn.map((room, index) => (
                              <span key={room.id}>
                                {index > 0 ? '、' : ''}
                                <Link className="text-primary" to={`/room/${room.id}`}>{room.title}</Link>
                              </span>
                            ))}
                          </p>
                        ) : (
                          <p className="m-0 mt-1.5 text-xs text-muted-foreground">还不在任何房间里</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {current && (
              <Form method="post" className="flex flex-col gap-2 px-[18px] py-4">
                <input type="hidden" name="intent" value="save-prompt" />
                <input type="hidden" name="agentId" value={current.id} />
                <label className={sectionLabel} htmlFor="agent-system-prompt">
                  {current.label} 的系统提示
                </label>
                <Textarea
                  key={current.id}
                  id="agent-system-prompt"
                  name="systemPrompt"
                  rows={9}
                  maxLength={4000}
                  disabled={busy}
                  defaultValue={current.systemPrompt ?? ''}
                  placeholder="给这位的常驻说明。空着就按默认方式调用。"
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="m-0 text-xs text-muted-foreground">保存在这台机器上，所有房间共用。</p>
                  <Button type="submit" disabled={busy}>保存</Button>
                </div>
              </Form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
