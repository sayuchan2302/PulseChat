import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type {
  ChatMessage,
  SharedContentKind,
  SharedContentLoadOptions,
} from '../../types/chat.types';
import { ChevronDownIcon, DocumentIcon, JumpIcon } from '../../icons/ChatIcons';
import { formatMessageTime } from '../../utils/formatUtils';
import { getMessageType } from '../../utils/messageUtils';
import {
  formatFileSize,
  getFileBadgeColor,
  getFileExtension,
  getLinkPreviewDomain,
} from '../../utils/mediaUtils';
import { getMediaUrl } from '../../utils/userUtils';

interface SharedContentSectionsProps {
  sharedMediaExpanded: boolean;
  setSharedMediaExpanded: Dispatch<SetStateAction<boolean>>;
  sharedFilesExpanded: boolean;
  setSharedFilesExpanded: Dispatch<SetStateAction<boolean>>;
  sharedLinksExpanded: boolean;
  setSharedLinksExpanded: Dispatch<SetStateAction<boolean>>;
  sharedMediaItems: ChatMessage[];
  sharedLinkItems: ChatMessage[];
  sharedMediaLoading: boolean;
  sharedLinksLoading: boolean;
  sharedMediaError: string;
  sharedLinksError: string;
  sharedMediaHasMore: boolean;
  sharedLinksHasMore: boolean;
  loadSharedContent: (kind: SharedContentKind, options?: SharedContentLoadOptions) => Promise<void>;
  onOpenMedia: (message: ChatMessage) => void;
  onJumpToMessage: (messageId: number) => Promise<void>;
}

export default function SharedContentSections({
  sharedMediaExpanded,
  setSharedMediaExpanded,
  sharedFilesExpanded,
  setSharedFilesExpanded,
  sharedLinksExpanded,
  setSharedLinksExpanded,
  sharedMediaItems,
  sharedLinkItems,
  sharedMediaLoading,
  sharedLinksLoading,
  sharedMediaError,
  sharedLinksError,
  sharedMediaHasMore,
  sharedLinksHasMore,
  loadSharedContent,
  onOpenMedia,
  onJumpToMessage,
}: SharedContentSectionsProps) {
  const sharedPhotoVideoItems = sharedMediaItems.filter(
    (message) => getMessageType(message) === 'IMAGE' || getMessageType(message) === 'VIDEO',
  );
  const sharedFileItems = sharedMediaItems.filter(
    (message) => getMessageType(message) === 'FILE',
  );

  const renderMedia = () => {
    if (sharedMediaLoading && sharedPhotoVideoItems.length === 0) {
      return (
        <div className="shared-media-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={`shared-media-skeleton-${index}`} className="shared-media-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedMediaError && sharedPhotoVideoItems.length === 0) {
      return renderRetryState(sharedMediaError, 'media');
    }

    if (sharedPhotoVideoItems.length === 0) {
      return <div className="details-empty-text">No shared media yet.</div>;
    }

    return (
      <>
        <div className="shared-media-grid">
          {sharedPhotoVideoItems.map((message) => {
            const mediaUrl = getMediaUrl(message.mediaUrl);
            if (!mediaUrl) return null;

            const isVideo = getMessageType(message) === 'VIDEO';
            return (
              <div key={message.id} className="shared-media-card">
                <button
                  type="button"
                  className="shared-media-item"
                  onClick={() => onOpenMedia(message)}
                  aria-label={isVideo ? 'Open video preview' : 'Open image preview'}
                  title={isVideo ? 'Video' : 'Photo'}
                >
                  {isVideo ? (
                    <><video src={mediaUrl} muted playsInline preload="metadata" /><span className="shared-media-play" aria-hidden="true" /></>
                  ) : (
                    <img src={mediaUrl} alt={message.content || 'Shared image'} loading="lazy" />
                  )}
                </button>
                <JumpButton className="shared-media-jump-btn" messageId={message.id} onJumpToMessage={onJumpToMessage} />
              </div>
            );
          })}
        </div>
        {sharedMediaError ? <div className="shared-content-inline-error">{sharedMediaError}</div> : null}
        {sharedMediaHasMore ? (
          <LoadMoreButton loading={sharedMediaLoading} onClick={() => void loadSharedContent('media')} />
        ) : null}
      </>
    );
  };

  const renderFiles = () => {
    if (sharedMediaLoading && sharedFileItems.length === 0) {
      return (
        <div className="shared-file-list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={`shared-file-skeleton-${index}`} className="shared-link-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedMediaError && sharedFileItems.length === 0) {
      return renderRetryState(sharedMediaError, 'media');
    }

    if (sharedFileItems.length === 0) {
      return <div className="details-empty-text">No shared files yet.</div>;
    }

    return (
      <>
        <div className="shared-file-list">
          {sharedFileItems.map((message) => {
            const mediaUrl = getMediaUrl(message.mediaUrl);
            if (!mediaUrl) return null;

            const ext = getFileExtension(message.mediaFormat || message.content || mediaUrl);
            const fileName = message.content?.trim() || `attachment.${ext.toLowerCase()}`;
            const badgeClass = getFileBadgeColor(ext);
            const sizeLabel = formatFileSize(message.mediaBytes);

            return (
              <div key={message.id} className="shared-file-row">
                <a className="shared-file-item" href={mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer" title={`Download ${fileName}`}>
                  <div className={`shared-file-icon-wrap ${badgeClass}`}>
                    <DocumentIcon className="shared-file-icon" />
                    <span className="shared-file-ext">{ext}</span>
                  </div>
                  <div className="shared-file-info">
                    <strong className="shared-file-name" title={fileName}>{fileName}</strong>
                    <span className="shared-file-meta">{sizeLabel ? `${sizeLabel} • ` : ''}{formatMessageTime(message.timestamp)}</span>
                  </div>
                </a>
                <JumpButton className="shared-link-jump-btn" messageId={message.id} onJumpToMessage={onJumpToMessage} />
              </div>
            );
          })}
        </div>
        {sharedMediaError ? <div className="shared-content-inline-error">{sharedMediaError}</div> : null}
        {sharedMediaHasMore ? (
          <LoadMoreButton loading={sharedMediaLoading} onClick={() => void loadSharedContent('media')} />
        ) : null}
      </>
    );
  };

  const renderLinks = () => {
    if (sharedLinksLoading && sharedLinkItems.length === 0) {
      return (
        <div className="shared-link-list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={`shared-link-skeleton-${index}`} className="shared-link-skeleton" />
          ))}
        </div>
      );
    }

    if (sharedLinksError && sharedLinkItems.length === 0) {
      return renderRetryState(sharedLinksError, 'links');
    }

    if (sharedLinkItems.length === 0) {
      return <div className="details-empty-text">No shared links yet.</div>;
    }

    return (
      <>
        <div className="shared-link-list">
          {sharedLinkItems.map((message) => {
            const preview = message.linkPreview;
            const url = preview?.url?.trim();
            if (!url) return null;

            const title = preview?.title?.trim() || url;
            const description = preview?.description?.trim() || message.content?.trim() || url;
            const domain = getLinkPreviewDomain(preview) || 'Link';

            return (
              <div key={message.id} className="shared-link-row">
                <a className="shared-link-item" href={url} target="_blank" rel="noreferrer">
                  <span className="shared-link-domain">{domain}</span>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </a>
                <JumpButton className="shared-link-jump-btn" messageId={message.id} onJumpToMessage={onJumpToMessage} />
              </div>
            );
          })}
        </div>
        {sharedLinksError ? <div className="shared-content-inline-error">{sharedLinksError}</div> : null}
        {sharedLinksHasMore ? (
          <LoadMoreButton loading={sharedLinksLoading} onClick={() => void loadSharedContent('links')} />
        ) : null}
      </>
    );
  };

  const renderRetryState = (error: string, kind: SharedContentKind) => (
    <div className="shared-content-state">
      <span>{error}</span>
      <button type="button" className="shared-content-retry-btn" onClick={() => void loadSharedContent(kind, { reset: true })}>
        Retry
      </button>
    </div>
  );

  return (
    <>
      <SharedContentSection id="shared-media" title="Media" count={sharedPhotoVideoItems.length} expanded={sharedMediaExpanded} onToggle={() => setSharedMediaExpanded((current) => !current)}>
        {renderMedia()}
      </SharedContentSection>
      <SharedContentSection id="shared-files" title="Files" count={sharedFileItems.length} expanded={sharedFilesExpanded} onToggle={() => setSharedFilesExpanded((current) => !current)}>
        {renderFiles()}
      </SharedContentSection>
      <SharedContentSection id="shared-links" title="Links" count={sharedLinkItems.length} expanded={sharedLinksExpanded} onToggle={() => setSharedLinksExpanded((current) => !current)}>
        {renderLinks()}
      </SharedContentSection>
    </>
  );
}

function SharedContentSection({ id, title, count, expanded, onToggle, children }: {
  id: string;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="details-section" aria-labelledby={`${id}-title`}>
      <button type="button" className="details-section-toggle-btn" onClick={onToggle} aria-expanded={expanded} aria-controls={`${id}-panel`}>
        <div className="details-section-heading">
          <h4 id={`${id}-title`}>{title}</h4>
          {count > 0 ? <span>{count}</span> : null}
        </div>
        <ChevronDownIcon className={`details-toggle-icon ${expanded ? 'expanded' : ''}`} />
      </button>
      {expanded ? <div id={`${id}-panel`} className="shared-content-panel">{children}</div> : null}
    </section>
  );
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <button type="button" className="shared-content-load-btn" disabled={loading} onClick={onClick}>{loading ? 'Loading' : 'Load more'}</button>;
}

function JumpButton({ className, messageId, onJumpToMessage }: { className: string; messageId: number; onJumpToMessage: (messageId: number) => Promise<void> }) {
  return (
    <button type="button" className={className} onClick={() => void onJumpToMessage(messageId)} aria-label="Go to message" title="Go to message">
      <JumpIcon className="shared-link-jump-icon" />
    </button>
  );
}
