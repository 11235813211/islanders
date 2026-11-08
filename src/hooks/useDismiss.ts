import { type RefObject, useEffect } from 'react';

/** Close a popover when someone presses outside `root` or hits Escape. */
export function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, root]);
}
