import type { RefObject } from 'react';

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: [
      { symbol: '😀', label: 'grinning face' },
      { symbol: '😄', label: 'smiling face' },
      { symbol: '😁', label: 'beaming face' },
      { symbol: '😂', label: 'face with tears of joy' },
      { symbol: '🤣', label: 'rolling on the floor laughing' },
      { symbol: '😊', label: 'smiling face with smiling eyes' },
      { symbol: '😍', label: 'smiling face with heart eyes' },
      { symbol: '😘', label: 'face blowing a kiss' },
      { symbol: '😎', label: 'smiling face with sunglasses' },
      { symbol: '🥹', label: 'holding back tears' },
      { symbol: '😭', label: 'loudly crying face' },
      { symbol: '😡', label: 'angry face' },
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      { symbol: '👍', label: 'thumbs up' },
      { symbol: '👎', label: 'thumbs down' },
      { symbol: '👏', label: 'clapping hands' },
      { symbol: '🙌', label: 'raising hands' },
      { symbol: '🙏', label: 'folded hands' },
      { symbol: '🤝', label: 'handshake' },
      { symbol: '💪', label: 'flexed biceps' },
      { symbol: '👌', label: 'ok hand' },
      { symbol: '✌️', label: 'victory hand' },
      { symbol: '🤞', label: 'crossed fingers' },
      { symbol: '👋', label: 'waving hand' },
      { symbol: '🫶', label: 'heart hands' },
    ],
  },
  {
    name: 'Hearts',
    emojis: [
      { symbol: '❤️', label: 'red heart' },
      { symbol: '💜', label: 'purple heart' },
      { symbol: '💙', label: 'blue heart' },
      { symbol: '💚', label: 'green heart' },
      { symbol: '💛', label: 'yellow heart' },
      { symbol: '🧡', label: 'orange heart' },
      { symbol: '🤍', label: 'white heart' },
      { symbol: '💔', label: 'broken heart' },
      { symbol: '💕', label: 'two hearts' },
      { symbol: '💞', label: 'revolving hearts' },
      { symbol: '💘', label: 'heart with arrow' },
      { symbol: '💝', label: 'heart with ribbon' },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { symbol: '🔥', label: 'fire' },
      { symbol: '✨', label: 'sparkles' },
      { symbol: '🎉', label: 'party popper' },
      { symbol: '🎂', label: 'birthday cake' },
      { symbol: '🌟', label: 'glowing star' },
      { symbol: '💯', label: 'hundred points' },
      { symbol: '✅', label: 'check mark' },
      { symbol: '☕', label: 'hot beverage' },
      { symbol: '🍕', label: 'pizza' },
      { symbol: '🎧', label: 'headphones' },
      { symbol: '📚', label: 'books' },
      { symbol: '💻', label: 'laptop' },
    ],
  },
] as const;

export interface EmojiPickerPanelProps {
  emojiPickerRef: RefObject<HTMLDivElement | null>;
  onInsertEmoji: (emoji: string) => void;
}

export function EmojiPickerPanel({ emojiPickerRef, onInsertEmoji }: EmojiPickerPanelProps) {
  return (
    <div ref={emojiPickerRef} id="emoji-picker-panel" className="emoji-picker-panel" role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-header">Emoji</div>
      <div className="emoji-category-list">
        {EMOJI_CATEGORIES.map((category) => (
          <section key={category.name} className="emoji-category">
            <div className="emoji-category-title">{category.name}</div>
            <div className="emoji-grid">
              {category.emojis.map((emoji) => (
                <button
                  key={`${category.name}-${emoji.symbol}`}
                  type="button"
                  className="emoji-option-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onInsertEmoji(emoji.symbol)}
                  aria-label={`Insert ${emoji.label}`}
                  title={emoji.label}
                >
                  {emoji.symbol}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default EmojiPickerPanel;
