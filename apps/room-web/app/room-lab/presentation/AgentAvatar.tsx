import type { RoomLabAgentId } from '../read-model';

export function AgentAvatar({ agentId, className }: {
  agentId: RoomLabAgentId;
  className?: string;
}) {
  return <img src={`/images/crew/${agentId}.png`} alt="" aria-hidden="true"
    width={64} height={64} className={className} />;
}
