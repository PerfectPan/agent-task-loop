import type { MentionOption } from './mention-completion';
import styles from './RoomLab.module.css';

export function MentionMenu({
  options,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  options: MentionOption[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (option: MentionOption) => void;
}) {
  return (
    <div id="room-mention-options" className={styles.mentionMenu} role="listbox">
      {options.length === 0 ? (
        <p>没有匹配的本地 Agent</p>
      ) : options.map((option, index) => (
        <button
          key={option.id}
          id={`room-mention-${option.id}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={index === activeIndex ? styles.activeMention : undefined}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(option)}
        >
          <strong>@{option.id}</strong>
          <span>{option.label}</span>
          <small>{option.description}</small>
        </button>
      ))}
    </div>
  );
}
