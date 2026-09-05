import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { At } from '@phosphor-icons/react/dist/ssr/At';
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { MentionMenu } from './MentionMenu';
import { buildMentionOptions, mentionCompletion, type MentionOption } from './mention-completion';
import type { RoomLabAgentId } from '../read-model';
import styles from './RoomComposer.module.css';

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
    <form className={styles.composer} onSubmit={submit}>
      {mode === 'task' && <div className={styles.taskMode}>
        <strong>创建任务</strong><span>Codex 实施，Claude 独立审核</span>
        <button type="button" onClick={() => onModeChange('room')} disabled={disabled}>取消</button>
      </div>}
      <label className={styles.srOnly} htmlFor="room-command">{mode === 'room' ? '向房间发送消息' : '任务目标与验收要求'}</label>
      <div className={styles.inputArea}>
        <textarea ref={textareaRef} id="room-command" value={value} maxLength={2_000} rows={2}
          disabled={disabled} onBlur={() => setMentionQuery(undefined)} onKeyDown={handleKeyDown}
          role={mode === 'room' ? 'combobox' : undefined}
          aria-autocomplete={mode === 'room' ? 'list' : undefined}
          aria-expanded={mode === 'room' ? mentionQuery !== undefined : undefined}
          aria-controls={mode === 'room' && mentionQuery ? 'room-mention-options' : undefined}
          aria-activedescendant={mentionQuery && mentionOptions[activeMentionIndex]
            ? `room-mention-${mentionOptions[activeMentionIndex]?.id}` : undefined}
          aria-describedby="room-composer-hint"
          placeholder={mode === 'room' ? '发给房间，输入 @ 选择 Agent' : '描述任务目标，以及怎样才算完成…'}
          onChange={event => {
            const next = event.currentTarget.value;
            onValueChange(next);
            setMentionQuery(mode === 'room' ? mentionCompletion.find(next, event.currentTarget.selectionStart) : undefined);
            setActiveMentionIndex(0);
          }} />
        {mode === 'room' && mentionQuery && <MentionMenu options={mentionOptions} activeIndex={activeMentionIndex}
          onActiveIndexChange={setActiveMentionIndex} onSelect={selectMention} />}
      </div>
      <div className={styles.toolbar}>
        {mode === 'room' && <button type="button" className={styles.mentionButton} disabled={disabled}
          onMouseDown={event => event.preventDefault()} onClick={openMentions}><At size={22} />提及</button>}
        <span id="room-composer-hint" className={styles.hint}>
          {mode === 'room' ? 'Enter 发送 · Shift + Enter 换行' : '模型审核通过后，仍需由你最终验收'}
        </span>
        <button className={styles.sendButton} type="submit" disabled={!canSend}>
          {disabled ? '运行中…' : mode === 'room' ? '发送' : '开始任务'}<PaperPlaneTilt size={22} weight="fill" />
        </button>
      </div>
    </form>
  );
}
