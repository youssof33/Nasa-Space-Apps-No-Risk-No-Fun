import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../../ui/components/icons";

interface Props {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ComponentChildren;
}

export function Modal({ open, title, eyebrow, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      class="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div class="modal__panel">
        <header class="modal__head">
          <div>
            {eyebrow && <p class="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button class="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </header>
        <div class="modal__body">{children}</div>
      </div>
    </dialog>
  );
}
