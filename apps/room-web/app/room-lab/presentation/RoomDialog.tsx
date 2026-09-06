import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react/dist/ssr/X';
import styles from './RoomLab.module.css';

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
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}
      onCancel={onClose} onClose={onClose}>
      <header className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="关闭弹窗"><X size={22} /></button>
      </header>
      {children}
    </dialog>
  );
}
