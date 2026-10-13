import { useState } from 'react';
import type { ChatMessage } from '../../types/chat.types';

interface EditMessageModalProps {
  message: ChatMessage;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}

export default function EditMessageModal({ message, onClose, onSave }: EditMessageModalProps) {
  const [content, setContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const normalizedContent = content.trim();
    if (!normalizedContent || normalizedContent.length > 5000 || saving) return;

    setSaving(true);
    setError('');
    try {
      await onSave(normalizedContent);
    } catch {
      setError('Unable to edit message. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop edit-message-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-message-title" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="edit-message-modal">
        <h3 id="edit-message-title">Edit message</h3>
        <textarea
          autoFocus
          className="edit-message-textarea"
          aria-label="Message text"
          maxLength={5000}
          value={content}
          disabled={saving}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="edit-message-meta"><span>{content.length}/5000</span>{error ? <span className="edit-message-error" role="alert">{error}</span> : null}</div>
        <div className="edit-message-actions">
          <button type="button" className="secondary-btn" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className="edit-message-save-btn" disabled={saving || !content.trim() || content.length > 5000} onClick={() => void handleSave()}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
