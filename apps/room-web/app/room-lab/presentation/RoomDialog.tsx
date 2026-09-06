import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react/dist/ssr/X';
import { focusRing } from './ui';

export function RoomDialog({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="w-[min(740px,calc(100vw-32px))] max-h-[calc(100dvh-48px)] rounded-[10px] border border-line bg-washi p-6 text-ink [&::backdrop]:bg-ink/40"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="mb-3 flex items-center justify-between gap-4 border-b border-line pb-3">
        <h2 id={titleId} className="m-0 font-serif text-xl font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="关闭弹窗" className={`grid size-9 place-items-center bg-transparent ${focusRing}`}>
          <X size={22} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
