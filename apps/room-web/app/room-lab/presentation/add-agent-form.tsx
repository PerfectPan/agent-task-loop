import { useState } from 'react';
import { Form } from 'react-router';
import { isAgentId } from '../domain/agent-registry';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { sectionLabel } from './ui';
import { copy } from '../copy';

/**
 * One row the catalog has never heard of is one more row (docs/architecture/agent-collaboration.md): the form
 * writes it, the next scan answers for it. The id is the word after `@`, so the
 * form refuses anything off the mention grammar before the server has to.
 */
export function AddAgentForm({ busy, error }: { busy: boolean; error?: string }) {
  const [idRejected, setIdRejected] = useState(false);
  return (
    <Form
      method="post"
      className="flex flex-col gap-3 border-t border-border px-[18px] py-4"
      onSubmit={(event) => {
        const id = new FormData(event.currentTarget).get('id');
        const wellFormed = typeof id === 'string' && isAgentId(id);
        setIdRejected(!wellFormed);
        if (!wellFormed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="add-agent" />
      <h2 className={`${sectionLabel} m-0`}>{copy.label.addAgent}</h2>
      <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-sm">
          {copy.label.agentId}
          <Input
            name="id"
            required
            maxLength={40}
            pattern="[a-z][a-z0-9-]*"
            placeholder={copy.label.agentIdPlaceholder}
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {copy.label.agentLabel}
          <Input name="label" required maxLength={40} placeholder={copy.label.agentLabelPlaceholder} disabled={busy} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {copy.label.agentCommand}
          <Input
            name="command"
            required
            maxLength={400}
            className="font-mono"
            placeholder={copy.label.agentCommandPlaceholder}
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          {copy.label.agentRole}
          <Input name="role" maxLength={40} placeholder={copy.label.agentRolePlaceholder} disabled={busy} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p data-error className="m-0 min-h-4 text-xs text-destructive" role={idRejected || error ? 'alert' : undefined}>
          {idRejected ? copy.say.agentIdPattern : (error ?? '')}
        </p>
        <Button type="submit" className="self-end" disabled={busy}>
          {copy.action.addAgent}
        </Button>
      </div>
    </Form>
  );
}
