import type { FormEvent } from 'react';
import styles from './RoomLab.module.css';

export function RoomComposer({
  mode,
  value,
  disabled,
  onModeChange,
  onValueChange,
  onSubmit,
}: {
  mode: 'room' | 'task';
  value: string;
  disabled: boolean;
  onModeChange: (mode: 'room' | 'task') => void;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
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
          disabled={disabled}
        >
          Task gate
        </button>
      </div>
      <label htmlFor="room-command">
        {mode === 'room' ? '向共享 Room 发消息' : '创建一条需要实施并独立审核的 Task'}
      </label>
      <div className={styles.commandRow}>
        <textarea
          id="room-command"
          value={value}
          maxLength={2_000}
          rows={3}
          disabled={disabled}
          placeholder={mode === 'room'
            ? '例如：比较事件溯源和普通消息列表的差异'
            : '例如：用三条验收标准定义一个可靠的 Room 实现'}
          onChange={event => onValueChange(event.target.value)}
        />
        <button type="submit" disabled={disabled || !value.trim()}>
          {disabled ? '运行中…' : mode === 'room' ? '并发呼叫' : '开始 Task'}
        </button>
      </div>
      <p>
        {mode === 'room'
          ? 'Codex 与 Claude 从同一 seen 边界并发生成；先完成者进入世界，后完成者可能 HELD。'
          : 'Occupancy 先开放 impl，再开放 review；只有独立 reviewer 给出 PASS，Task 才通过。'}
      </p>
    </form>
  );
}
