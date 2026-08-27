import VoiceMessagePlayer from '../VoiceMessagePlayer';
import type { ChatMessage } from '../../types/chat.types';
import { DocumentIcon, DownloadIcon, ForwardIcon } from '../../icons/ChatIcons';
import { getMessageType } from '../../utils/messageUtils';
import {
  formatFileSize,
  getDownloadFilename,
  getFileBadgeColor,
  getFileExtension,
  hasLinkPreview,
} from '../../utils/mediaUtils';
import { getMediaUrl } from '../../utils/userUtils';
import { renderLinkedText, renderLinkPreviewCard } from '../../utils/renderUtils';
import MessageReplyQuote from './MessageReplyQuote';
import RecalledMessageContent from './RecalledMessageContent';

interface MessageContentProps {
  message: ChatMessage;
  onOpenLightbox: (url: string, type: 'IMAGE' | 'VIDEO', fileName?: string) => void;
  onAssetLoaded: () => void;
}

export default function MessageContent({ message, onOpenLightbox, onAssetLoaded }: MessageContentProps) {
  const mediaUrl = getMediaUrl(message.mediaUrl);
  if (message.recalled) return <RecalledMessageContent />;
  if (getMessageType(message) === 'IMAGE' && mediaUrl) {
    return <div className="message-media-content"><MessageReplyQuote reply={message.replyTo} />
      <button type="button" className="message-image-preview-btn"
        onClick={() => onOpenLightbox(mediaUrl, 'IMAGE', message.content || 'image')} aria-label="Open image preview">
        <img src={mediaUrl} alt={message.content || 'Shared image'} onLoad={onAssetLoaded} onError={onAssetLoaded} />
      </button>
      {message.content ? <div className="message-media-caption">{renderLinkedText(message.content)}</div> : null}
    </div>;
  }
  if (getMessageType(message) === 'VIDEO' && mediaUrl) {
    return <div className="message-media-content"><MessageReplyQuote reply={message.replyTo} />
      <div className="message-video-preview-wrap" onClick={() => onOpenLightbox(mediaUrl, 'VIDEO', message.content || 'video')} style={{ cursor: 'pointer' }}>
        <video className="message-video-preview" src={mediaUrl} controls={false} preload="metadata" onLoadedMetadata={onAssetLoaded} onError={onAssetLoaded} />
      </div>
      {message.content ? <div className="message-media-caption">{renderLinkedText(message.content)}</div> : null}
    </div>;
  }
  if (getMessageType(message) === 'AUDIO' && mediaUrl) {
    return <div className="message-media-content">
      {message.forwardedFromId ? <ForwardedHeader message={message} /> : null}
      <MessageReplyQuote reply={message.replyTo} />
      <div className="message-voice"><VoiceMessagePlayer src={mediaUrl} durationSeconds={message.mediaDuration} /></div>
    </div>;
  }
  if (getMessageType(message) === 'FILE' && mediaUrl) {
    const ext = getFileExtension(message.mediaFormat || message.content || mediaUrl);
    const fileName = getDownloadFilename(message);
    const badgeClass = getFileBadgeColor(ext);
    const sizeLabel = formatFileSize(message.mediaBytes);
    return <div className="message-media-content message-file-card-content">
      {message.forwardedFromId ? <ForwardedHeader message={message} /> : null}
      <MessageReplyQuote reply={message.replyTo} />
      <div className="message-file-card">
        <div className={`file-card-icon-wrap ${badgeClass}`}><DocumentIcon className="file-card-icon" /><span className="file-card-ext">{ext}</span></div>
        <div className="file-card-info"><span className="file-card-name" title={fileName}>{fileName}</span>{sizeLabel ? <span className="file-card-size">{sizeLabel}</span> : null}</div>
        <a href={mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="file-card-download-btn" title={`Download ${fileName}`} aria-label={`Download ${fileName}`}><DownloadIcon className="file-card-download-icon" /></a>
      </div>
    </div>;
  }
  return <div className={`message-content ${hasLinkPreview(message.linkPreview) ? 'has-link-preview' : ''}`}>
    {message.forwardedFromId ? <ForwardedHeader message={message} /> : null}
    <MessageReplyQuote reply={message.replyTo} />
    {message.content ? <div className="message-text">{renderLinkedText(message.content)}</div> : null}
    {renderLinkPreviewCard(message.linkPreview, onAssetLoaded)}
  </div>;
}

function ForwardedHeader({ message }: { message: ChatMessage }) {
  return <div className="forwarded-header"><ForwardIcon className="forwarded-icon" />
    <span>Forwarded from <strong>{message.forwardedFromSenderName ?? 'Unknown'}</strong></span>
  </div>;
}
