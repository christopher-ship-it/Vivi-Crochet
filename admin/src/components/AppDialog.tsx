import { useEffect, useRef, useState } from 'react';

/**
 * In-app replacement for window.confirm / window.alert, so prompts use the
 * console's own modal instead of the browser's "site says" box.
 *
 * Call `confirmDialog(message)` / `alertDialog(message)` from anywhere; the
 * `<AppDialogHost />` mounted once in App renders the queue.
 */

type DialogKind = 'confirm' | 'alert';

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface DialogRequest extends DialogOptions {
  id: number;
  kind: DialogKind;
  message: string;
  resolve: (value: boolean) => void;
}

let nextId = 1;
let queue: DialogRequest[] = [];
const listeners = new Set<(queue: DialogRequest[]) => void>();

function emit() {
  for (const listener of listeners) listener(queue);
}

function enqueue(kind: DialogKind, message: string, options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { id: nextId++, kind, message, resolve, ...options }];
    emit();
  });
}

const DESTRUCTIVE = /^(delete|remove|release|permanently)/i;

/** Resolves true on confirm, false on cancel / Escape / backdrop click. */
export function confirmDialog(message: string, options: DialogOptions = {}): Promise<boolean> {
  const danger = options.danger ?? DESTRUCTIVE.test(message.trim());
  const verb = /^\s*(delete|remove)/i.exec(message)?.[1];
  return enqueue('confirm', message, {
    title: options.title ?? (danger ? 'Are you sure?' : 'Please confirm'),
    confirmLabel:
      options.confirmLabel ?? (verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : 'Confirm'),
    cancelLabel: options.cancelLabel ?? 'Cancel',
    danger,
  });
}

export function alertDialog(message: string, options: DialogOptions = {}): Promise<void> {
  return enqueue('alert', message, {
    title: options.title ?? 'Notice',
    confirmLabel: options.confirmLabel ?? 'OK',
    danger: options.danger,
  }).then(() => undefined);
}

export function AppDialogHost() {
  const [items, setItems] = useState<DialogRequest[]>(queue);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const current = items[0];

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  function close(value: boolean) {
    if (!current) return;
    current.resolve(value);
    queue = queue.filter((item) => item.id !== current.id);
    emit();
  }

  useEffect(() => {
    if (!current) return;
    // Destructive prompts start on Cancel so a stray Enter can't delete anything.
    (current.danger && cancelRef.current ? cancelRef : confirmRef).current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // close depends only on `current`, which is the effect key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const isConfirm = current.kind === 'confirm';

  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div
        className="modal modal--sm app-dialog"
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`app-dialog-title-${current.id}`}
        aria-describedby={`app-dialog-msg-${current.id}`}
      >
        <div className="app-dialog__body">
          <span
            className={`app-dialog__icon${current.danger ? ' app-dialog__icon--danger' : ''}`}
            aria-hidden
          >
            {current.danger ? '!' : isConfirm ? '?' : 'i'}
          </span>
          <div className="app-dialog__copy">
            <h2 className="app-dialog__title" id={`app-dialog-title-${current.id}`}>
              {current.title}
            </h2>
            <p className="app-dialog__message" id={`app-dialog-msg-${current.id}`}>
              {current.message}
            </p>
          </div>
        </div>
        <div className="app-dialog__footer">
          {isConfirm ? (
            <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={() => close(false)}>
              {current.cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${current.danger ? 'btn--danger-solid' : 'btn--primary'}`}
            onClick={() => close(true)}
          >
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
