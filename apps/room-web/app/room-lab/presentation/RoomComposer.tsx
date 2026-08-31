import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { MentionMenu } from './MentionMenu';
import {
  buildMentionOptions,
  mentionCompletion,
  type MentionOption,
} from './mention-completion';
import type { RoomLabAgentId } from '../read-model';
import styles from './RoomLab.module.css';

export function RoomComposer({
  mode,
  value,
  disabled,
  activeAgentIds,
  taskGateReady,
  onModeChange,
  onValueChange,
  onSubmit,
}: {
  mode: 'room' | 'task';
  value: string;
  disabled: boolean;
  activeAgentIds: RoomLabAgentId[];
  taskGateReady: boolean;
  onModeChange: (mode: 'room' | 'task') => void;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<
    ReturnType<typeof mentionCompletion.find>
  >();
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const availableMentionOptions = buildMentionOptions(activeAgentIds);
  const mentionOptions = mentionQuery
    ? mentionCompletion.filter(mentionQuery.query, availableMentionOptions)
    : [];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const selectMention = (option: MentionOption) => {
    if (!mentionQuery) return;
    const inserted = mentionCompletion.insert(value, mentionQuery, option);
    onValueChange(inserted.value);
    setMentionQuery(undefined);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && mentionOptions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveMentionIndex(current =>
          (current + direction + mentionOptions.length) % mentionOptions.length,
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
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
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.modeSwitch} role="group" aria-label="Run mode">
        <button
          type="button"
          aria-pressed={mode === 'room'}
          className={mode === 'room' ? styles.activeMode : undefined}
          onClick={() => onModeChange('room')}
          disabled={disabled}
        >
          Room chat
        </button>
        <button
          type="button"
          aria-pressed={mode === 'task'}
          className={mode === 'task' ? styles.activeMode : undefined}
          onClick={() => onModeChange('task')}
          disabled={disabled || !taskGateReady}
        >
          Task gate
        </button>
      </div>
      <label htmlFor="room-command">
        {mode === 'room' ? '向共享 Room 发消息' : '创建一条需要实施并独立审核的 Task'}
      </label>
      <div className={styles.commandRow}>
        <div className={styles.commandInput}>
          <textarea
            ref={textareaRef}
            id="room-command"
            value={value}
            maxLength={2_000}
            rows={3}
            disabled={disabled}
            role={mode === 'room' ? 'combobox' : undefined}
            aria-autocomplete={mode === 'room' ? 'list' : undefined}
            aria-expanded={mode === 'room' ? mentionQuery !== undefined : undefined}
            aria-controls={mentionQuery ? 'room-mention-options' : undefined}
            aria-activedescendant={mentionQuery && mentionOptions[activeMentionIndex]
              ? `room-mention-${mentionOptions[activeMentionIndex]?.id}`
              : undefined}
            placeholder={mode === 'room'
              ? `Message ${activeAgentIds.length} active agent${activeAgentIds.length === 1 ? '' : 's'}…`
              : '例如：用三条验收标准定义一个可靠的 Room 实现'}
            onBlur={() => setMentionQuery(undefined)}
            onKeyDown={handleKeyDown}
            onChange={event => {
              const nextValue = event.currentTarget.value;
              onValueChange(nextValue);
              if (mode === 'room') {
                setMentionQuery(mentionCompletion.find(
                  nextValue,
                  event.currentTarget.selectionStart,
                ));
                setActiveMentionIndex(0);
              }
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
          {mode === 'room' && (
            <span className={styles.mentionHint}>
              @agent 定向唤醒 · @all 全员呼叫 · ⌘/Ctrl + Enter 发送
            </span>
          )}
        </div>
        <div className={styles.commandActions}>
          <button type="submit" disabled={disabled || !value.trim()}>
            {disabled ? '运行中…' : mode === 'room' ? '发送到 Room' : '开始 Task'}
          </button>
        </div>
      </div>
      <p>
        {mode === 'room'
          ? `无 @ 时 ${activeAgentIds.length} 席并发；显式 @ 只唤醒被点名的席位。并发草稿仍受 Room HELD 写点约束。`
          : taskGateReady
            ? 'Codex 先实施，Claude 再独立审核；只有 reviewer 给出 PASS，Task 才通过。'
            : '把 Codex 和 Claude 都加入 Room 后，才能运行 Task gate。'}
      </p>
    </form>
  );
}
