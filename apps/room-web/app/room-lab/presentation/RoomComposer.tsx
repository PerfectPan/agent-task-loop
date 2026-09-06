import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { At } from '@phosphor-icons/react/dist/ssr/At';
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { MentionMenu } from './MentionMenu';
import { buildMentionOptions, mentionCompletion, type MentionOption } from './mention-completion';
import type { RoomLabAgentId } from '../read-model';
import { Button } from '~/components/ui/button';

export function RoomComposer({ mode, value, disabled, activeAgentIds, taskGateReady, onModeChange, onValueChange, onSubmit }: {
  mode: 'room' | 'task'; value: string; disabled: boolean; activeAgentIds: RoomLabAgentId[];
  taskGateReady: boolean; onModeChange: (mode: 'room' | 'task') => void;
  onValueChange: (value: string) => void; onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousMode = useRef(mode);
  const [mentionQuery, setMentionQuery] = useState<ReturnType<typeof mentionCompletion.find>>();
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const options = buildMentionOptions(activeAgentIds);
  const mentionOptions = mode === 'room' && mentionQuery ? mentionCompletion.filter(mentionQuery.query, options) : [];
  const canSend = !disabled && !!value.trim() && (mode === 'room' || taskGateReady);

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    setMentionQuery(undefined);
    textareaRef.current?.focus();
  }, [mode]);

  const send = () => { if (canSend) onSubmit(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); send(); };
  const positionCursor = (cursor: number) => window.requestAnimationFrame(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(cursor, cursor);
  });
  const selectMention = (option: MentionOption) => {
    if (!mentionQuery) return;
    const inserted = mentionCompletion.insert(value, mentionQuery, option);
    onValueChange(inserted.value);
    setMentionQuery(undefined);
    positionCursor(inserted.cursor);
  };
  const openMentions = () => {
    const start = textareaRef.current?.selectionStart ?? value.length;
    const end = textareaRef.current?.selectionEnd ?? start;
    const prefix = start > 0 && !/\s/.test(value[start - 1]!) ? ' @' : '@';
    const next = value.slice(0, start) + prefix + value.slice(end);
    if (next.length > 2_000) return;
    const cursor = start + prefix.length;
    onValueChange(next);
    setMentionQuery(mentionCompletion.find(next, cursor));
    setActiveMentionIndex(0);
    positionCursor(cursor);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (mentionQuery && mentionOptions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveMentionIndex(index => (index + direction + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault();
        const option = mentionOptions[activeMentionIndex] ?? mentionOptions[0];
        if (option) selectMention(option);
        return;
      }
    }
    if (event.key === 'Escape' && mentionQuery) {
      event.preventDefault();
      setMentionQuery(undefined);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) send();
    }
  };
  return (
    <form
      className={`relative mx-4 mb-4 shrink-0 rounded-[10px] border border-line bg-washi p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-hydrangea`}
      onSubmit={submit}
    >
      {mode === 'task' && (
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-line pb-2 text-sm">
          <strong>创建任务</strong>
          <span className="text-xs text-muted">Codex 实施，Claude 独立审核</span>
          <button type="button" className="ml-auto h-8 bg-transparent underline" onClick={() => onModeChange('room')} disabled={disabled}>取消</button>
        </div>
      )}
      <label className="sr-only" htmlFor="room-command">{mode === 'room' ? '向房间发送消息' : '任务目标与验收要求'}</label>
      <div className="relative">
        <textarea
          ref={textareaRef}
          id="room-command"
          value={value}
          maxLength={2_000}
          rows={2}
          disabled={disabled}
          onBlur={() => setMentionQuery(undefined)}
          onKeyDown={handleKeyDown}
          role={mode === 'room' ? 'combobox' : undefined}
          aria-autocomplete={mode === 'room' ? 'list' : undefined}
          aria-expanded={mode === 'room' ? mentionQuery !== undefined : undefined}
          aria-controls={mode === 'room' && mentionQuery ? 'room-mention-options' : undefined}
          aria-activedescendant={mentionQuery && mentionOptions[activeMentionIndex]
            ? `room-mention-${mentionOptions[activeMentionIndex]?.id}` : undefined}
          aria-describedby="room-composer-hint"
          placeholder={mode === 'room' ? '发给房间。不写 @，在场的人会按顺序接话。' : '目标、约束、产物、怎样才算完成'}
          className="block max-h-36 min-h-11 w-full resize-y border-0 bg-transparent p-0 text-sm leading-snug text-ink outline-0 placeholder:text-muted"
          onChange={event => {
            const next = event.currentTarget.value;
            onValueChange(next);
            setMentionQuery(mode === 'room' ? mentionCompletion.find(next, event.currentTarget.selectionStart) : undefined);
            setActiveMentionIndex(0);
          }}
        />
        {mode === 'room' && mentionQuery && (
          <MentionMenu
            options={mentionOptions}
            activeIndex={activeMentionIndex}
            onActiveIndexChange={setActiveMentionIndex}
            onSelect={selectMention}
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {mode === 'room' && (
          <Button
            type="button"
            variant="ghost"
            className="h-8 gap-1 px-1.5 text-hydrangea hover:text-moss-deep"
            disabled={disabled}
            onMouseDown={event => event.preventDefault()}
            onClick={openMentions}
          >
            <At size={18} />提及
          </Button>
        )}
        <span id="room-composer-hint" className="text-xs leading-tight text-muted">
          {mode === 'room' ? 'Enter 发送 · 未点名则依次发言' : '模型通过后，仍要你亲自验收'}
        </span>
        <Button
          className="ml-auto min-w-[72px] whitespace-nowrap disabled:bg-line disabled:text-muted disabled:hover:bg-line"
          type="submit"
          disabled={!canSend}
        >
          {disabled ? '正在送出' : mode === 'room' ? '发送' : '开始任务'}
          <PaperPlaneTilt size={16} weight="fill" />
        </Button>
      </div>
    </form>
  );
}
