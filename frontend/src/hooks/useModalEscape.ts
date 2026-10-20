import { useEffect } from 'react';

/**
 * Closes a modal when Escape is pressed.
 *
 * The listener runs in the capture phase and stops propagation so the
 * page-level Escape handler cannot close background panels underneath the
 * modal at the same time.
 */
export function useModalEscape(active: boolean, onClose: () => void, disabled = false) {
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!disabled) onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [active, disabled, onClose]);
}
