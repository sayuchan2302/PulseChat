import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderLinkedText } from './renderUtils';

describe('renderLinkedText', () => {
  it('renders bold, italic, strikethrough, inline code, links, and mentions together', () => {
    const { container } = render(
      <div>
        {renderLinkedText(
          'Hello **@alice** this is *italic*, ~~old~~, `npm test`, and https://pulsechat.dev/docs!'
        )}
      </div>
    );

    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.querySelector('.mention-tag')?.textContent).toBe('@alice');

    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('del')?.textContent).toBe('old');

    const inlineCode = container.querySelector('.message-inline-code');
    expect(inlineCode?.textContent).toBe('npm test');

    const link = container.querySelector('a.message-text-link');
    expect(link).toHaveAttribute('href', 'https://pulsechat.dev/docs');
  });

  it('renders multi-line code blocks with language label and copies code on click', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { container } = render(
      <div>
        {renderLinkedText('Check this:\n```ts\nconst answer = 42;\n```')}
      </div>
    );

    expect(container.querySelector('.message-code-lang')?.textContent).toBe('ts');
    expect(container.querySelector('.message-code-block code')?.textContent).toBe('const answer = 42;');

    const copyBtn = screen.getByRole('button', { name: 'Copy code' });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith('const answer = 42;');
    expect(copyBtn.textContent).toBe('Copied ✓');
  });
});

