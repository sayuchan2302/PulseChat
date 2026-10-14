import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalMessageSearchItem, GlobalMessageSearchPage } from '../../types';
import { apiClient } from '../../services/api';
import { CloseIcon, SearchIcon } from '../../icons/ChatIcons';

interface Props {
  onClose: () => void;
  onOpenResult: (item: GlobalMessageSearchItem) => Promise<void>;
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function getSnippet(item: GlobalMessageSearchItem) {
  const { message } = item;
  if (message.content.trim()) return message.content;
  if (message.linkPreview?.title) return message.linkPreview.title;
  if (message.type === 'IMAGE') return 'Photo';
  if (message.type === 'VIDEO') return 'Video';
  if (message.type === 'AUDIO') return 'Audio message';
  if (message.type === 'FILE') return 'File';
  return 'Message';
}

export default function GlobalMessageSearchModal({ onClose, onOpenResult }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GlobalMessageSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const queryRef = useRef('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadPage = useCallback(async (search: string, before?: number, append = false) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<GlobalMessageSearchPage>('/messages/search', {
        params: { query: search, size: 30, ...(before === undefined ? {} : { before }) },
      });
      if (requestId !== requestIdRef.current || queryRef.current !== search) return;
      setItems((current) => append ? [...current, ...response.data.items] : response.data.items);
      setHasMore(response.data.hasMore);
      setNextBefore(response.data.nextBefore ?? null);
    } catch (loadError) {
      console.error('Failed to search all conversations:', loadError);
      if (requestId === requestIdRef.current && queryRef.current === search) {
        setError('Unable to search messages. Try again.');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const search = query.trim();
    queryRef.current = search;
    const requestId = ++requestIdRef.current;
    setItems([]);
    setHasMore(false);
    setNextBefore(null);
    setError('');
    if (!search) {
      setLoading(false);
      return;
    }
    const timeoutId = window.setTimeout(() => void loadPage(search), 250);
    return () => {
      window.clearTimeout(timeoutId);
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [loadPage, query]);

  const handleOpenResult = async (item: GlobalMessageSearchItem) => {
    setOpeningId(item.message.id);
    setError('');
    try {
      await onOpenResult(item);
    } catch (openError) {
      console.error('Failed to open search result:', openError);
      setError('Unable to open this conversation. Try refreshing it.');
      setOpeningId(null);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore && nextBefore !== null && queryRef.current) {
      void loadPage(queryRef.current, nextBefore, true);
    }
  };

  return (
    <div className="global-search-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="global-search-modal" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
        <header className="global-search-header">
          <div>
            <span className="global-search-eyebrow">MESSAGES</span>
            <h2 id="global-search-title">Search all conversations</h2>
          </div>
          <button type="button" className="global-search-close" onClick={onClose} aria-label="Close search">
            <CloseIcon />
          </button>
        </header>

        <label className="global-search-input-wrap">
          <SearchIcon className="global-search-input-icon" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages, links, and conversations"
            aria-label="Search messages across conversations"
          />
        </label>

        <div className="global-search-results" aria-live="polite">
          {error ? <p className="global-search-error" role="alert">{error}</p> : null}
          {!query.trim() ? (
            <p className="global-search-hint">Search message text and link previews across your chats.</p>
          ) : loading && items.length === 0 ? (
            <p className="global-search-hint">Searching messages...</p>
          ) : items.length === 0 && !error ? (
            <p className="global-search-hint">No matching messages found.</p>
          ) : (
            <>
              {items.map((item) => (
                <button
                  type="button"
                  key={item.message.id}
                  className="global-search-result"
                  disabled={openingId !== null}
                  onClick={() => void handleOpenResult(item)}
                >
                  <span className="global-search-result-copy">
                    <span className="global-search-result-topline">
                      <strong>{item.conversationName}</strong>
                      <time>{formatTimestamp(item.message.timestamp)}</time>
                    </span>
                    <span className="global-search-result-sender">
                      {item.message.senderFullName || item.message.senderUsername || 'Unknown sender'}
                    </span>
                    <span className="global-search-result-snippet">{getSnippet(item)}</span>
                  </span>
                  {openingId === item.message.id ? <span className="global-search-opening">Opening...</span> : null}
                </button>
              ))}
              {hasMore ? (
                <button type="button" className="global-search-load-more" disabled={loading} onClick={handleLoadMore}>
                  {loading ? 'Loading...' : 'Load more results'}
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
