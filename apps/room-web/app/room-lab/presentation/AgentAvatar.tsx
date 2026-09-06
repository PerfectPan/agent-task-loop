import type { RoomLabAgentId } from '../read-model';

export function AgentAvatar({ agentId, className }: {
  agentId: RoomLabAgentId;
  className?: string;
}) {
  return <img src={`/images/crew/${agentId}.png`} alt="" aria-hidden="true"
    width={48} height={48} className={className} />;
}
