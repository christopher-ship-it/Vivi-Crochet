import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

export type RowActionItem = {
  id: string;
  label: string;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

type RowActionsMenuProps = {
  label: string;
  items: RowActionItem[];
  disabled?: boolean;
};

type MenuCoords = { top: number; left: number; openUp: boolean };

export function RowActionsMenu({ label, items, disabled }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const visible = items.filter((item) => !item.hidden);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 200;
      const estimatedHeight = Math.min(320, 12 + visible.length * 40);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight + 12 && rect.top > spaceBelow;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      setCoords({
        top: openUp ? rect.top - 6 : rect.bottom + 6,
        left,
        openUp,
      });
    }

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function closeAndRun(action?: () => void) {
    setOpen(false);
    action?.();
  }

  if (visible.length === 0) return null;

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        type="button"
        className={`row-actions__trigger${open ? ' row-actions__trigger--open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="row-actions__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={`row-actions__menu${coords.openUp ? ' row-actions__menu--up' : ''}`}
            role="menu"
            aria-label={label}
            style={{
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
            }}
          >
            {visible.map((item) =>
              item.to && !item.disabled ? (
                <Link
                  key={item.id}
                  to={item.to}
                  role="menuitem"
                  className={`row-actions__item${item.danger ? ' row-actions__item--danger' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`row-actions__item${item.danger ? ' row-actions__item--danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => closeAndRun(item.onClick)}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
