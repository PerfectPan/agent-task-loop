import type { MentionOption } from './mention-completion';

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
    <div
      id="room-mention-options"
      className="absolute bottom-[calc(100%+8px)] left-0 z-30 max-h-[min(260px,40dvh)] w-[min(360px,100%)] overflow-y-auto rounded-[10px] border border-line bg-washi p-1"
      role="listbox"
      aria-label="选择要提及的 Agent"
    >
      {options.length === 0 ? (
        <p className="m-2 text-sm">没有匹配的本地 Agent</p>
      ) : options.map((option, index) => (
        <button
          key={option.id}
          id={`room-mention-${option.id}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`grid w-full grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg border-0 bg-transparent px-2 py-2 text-left text-ink ${index === activeIndex ? 'bg-garden' : ''}`}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(option)}
        >
          <strong>@{option.id}</strong>
          <span className="self-center text-xs">{option.label}</span>
          <small className="col-span-full text-xs text-muted">{option.description}</small>
        </button>
      ))}
    </div>
  );
}
