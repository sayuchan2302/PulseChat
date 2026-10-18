import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus cycling inside the referenced dialog while `active` is true
 * and restores focus to the previously focused element once the dialog closes.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusableElements = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const owningDialog = activeElement?.closest('[role="dialog"]');
      if (activeElement && !container.contains(activeElement) && owningDialog && !owningDialog.contains(container)) {
        return; // focus is owned by another dialog stacked on top of this one
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}
