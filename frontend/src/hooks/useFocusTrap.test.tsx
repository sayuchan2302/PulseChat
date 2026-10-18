import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function Harness({ active }: { active: boolean }) {
  const containerRef = useFocusTrap<HTMLDivElement>(active);
  return (
    <div>
      <button type="button" data-testid="outside">outside</button>
      {active ? (
        <div ref={containerRef} role="dialog" aria-modal="true">
          <button type="button" data-testid="first">first</button>
          <button type="button" data-testid="second">second</button>
        </div>
      ) : null}
    </div>
  );
}

describe('useFocusTrap', () => {
  afterEach(() => cleanup());

  it('focuses the first element inside the dialog when it opens', () => {
    const { getByTestId, rerender } = render(<Harness active={false} />);
    getByTestId('outside').focus();

    rerender(<Harness active />);

    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps Tab from the last element to the first and Shift+Tab back', () => {
    const { getByTestId } = render(<Harness active />);
    const first = getByTestId('first');
    const second = getByTestId('second');

    second.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(second);
  });

  it('restores focus to the previously focused element when the dialog closes', () => {
    const { getByTestId, rerender } = render(<Harness active={false} />);
    const outside = getByTestId('outside');
    outside.focus();

    rerender(<Harness active />);
    rerender(<Harness active={false} />);

    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone while another dialog on top owns it', () => {
    const { getByTestId, rerender } = render(<Harness active={false} />);
    rerender(<Harness active />);

    const first = getByTestId('first');
    const outer = document.createElement('div');
    outer.setAttribute('role', 'dialog');
    const innerButton = document.createElement('button');
    outer.appendChild(innerButton);
    document.body.appendChild(outer);
    innerButton.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(innerButton);
    expect(document.activeElement).not.toBe(first);
    outer.remove();
  });
});
