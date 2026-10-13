import { useState } from 'react';
import type { ChatMessage } from '../../types/chat.types';

interface DeleteMessageForMeModalProps {
  message: ChatMessage;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteMessageForMeModal({ message, onClose, onConfirm }: DeleteMessageForMeModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch {
      setError('Unable to delete this message. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const preview = message.content?.trim() || 'This message';
  return (
    <div className="modal-backdrop delete-message-for-me-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-message-for-me-title" onClick={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
      <div className="delete-message-for-me-modal">
        <h3 id="delete-message-for-me-title">Delete for you?</h3>
        <p><strong>{preview.length > 120 ? `${preview.slice(0, 117)}…` : preview}</strong> will disappear from your account. Other participants will still see it.</p>
        {error ? <div className="edit-message-error" role="alert">{error}</div> : null}
        <div className="edit-message-actions">
          <button type="button" className="secondary-btn" disabled={deleting} onClick={onClose}>Cancel</button>
          <button type="button" className="delete-message-confirm-btn" disabled={deleting} onClick={() => void handleConfirm()}>{deleting ? 'Deleting...' : 'Delete for me'}</button>
        </div>
      </div>
    </div>
  );
}
