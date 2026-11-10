import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaLightbox } from './MediaLightbox';

describe('MediaLightbox', () => {
  const items = [
    { url: 'https://example.com/1.png', type: 'IMAGE' as const, fileName: '1.png' },
    { url: 'https://example.com/2.png', type: 'IMAGE' as const, fileName: '2.png' },
  ];

  it('supports keyboard zoom (+/-/0), mouse wheel zoom, double-click zoom, and thumbnail selection', () => {
    const onClose = vi.fn();
    const onSelectIndex = vi.fn();

    render(
      <MediaLightbox
        items={items}
        currentIndex={0}
        onClose={onClose}
        onSelectIndex={onSelectIndex}
      />
    );

    const img = screen.getByAltText('1.png');
    expect(img.style.transform).toBe('scale(1) rotate(0deg)');

    // Keyboard '+' zooms in to 1.25
    fireEvent.keyDown(window, { key: '+' });
    expect(img.style.transform).toBe('scale(1.25) rotate(0deg)');

    // Keyboard '0' resets transform to 1
    fireEvent.keyDown(window, { key: '0' });
    expect(img.style.transform).toBe('scale(1) rotate(0deg)');

    // Double-click toggles zoom to 2x
    fireEvent.doubleClick(img.parentElement!);
    expect(img.style.transform).toBe('scale(2) rotate(0deg)');

    // Mouse wheel down (deltaY > 0) zooms out by 0.25 -> 1.75
    fireEvent.wheel(img.parentElement!, { deltaY: 100 });
    expect(img.style.transform).toBe('scale(1.75) rotate(0deg)');

    // Clicking the second thumbnail selects index 1
    const secondTab = screen.getByRole('tab', { name: 'View media 2 of 2' });
    fireEvent.click(secondTab);
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });
});

