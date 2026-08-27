import { useCallback } from 'react';
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from 'react';
import type { MessageSearchLoadOptions } from '../types/chat.types';
import type { ChatMessage } from '../types/chat.types';

interface Options {
  query: string;
  queryRef: MutableRefObject<string>;
  requestedQueryRef: MutableRefObject<string>;
  inputRef: MutableRefObject<HTMLInputElement | null>;
  loadMessageSearch: (options: MessageSearchLoadOptions) => Promise<void>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSubmitted: Dispatch<SetStateAction<boolean>>;
  setItems: Dispatch<SetStateAction<ChatMessage[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setNextBefore: Dispatch<SetStateAction<number | null>>;
  setActiveId: Dispatch<SetStateAction<number | null>>;
}

export function useMessageSearchControls(options: Options) {
  const {
    query, queryRef, requestedQueryRef, inputRef, loadMessageSearch, setQuery, setSubmitted,
    setItems, setError, setHasMore, setNextBefore, setActiveId,
  } = options;
  const resetResults = useCallback(() => {
    setItems([]); setError(''); setHasMore(false); setNextBefore(null); setActiveId(null);
  }, [setActiveId, setError, setHasMore, setItems, setNextBefore]);
  const handleMessageSearchChange = useCallback((value: string) => {
    queryRef.current = value;
    setQuery(value);
    if (!value.trim()) { resetResults(); setSubmitted(false); }
  }, [queryRef, resetResults, setQuery, setSubmitted]);
  const handleClearMessageSearch = useCallback(() => {
    queryRef.current = ''; requestedQueryRef.current = '';
    setQuery(''); resetResults(); setSubmitted(false); inputRef.current?.focus();
  }, [inputRef, queryRef, requestedQueryRef, resetResults, setQuery, setSubmitted]);
  const handleMessageSearchSubmit = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setSubmitted(true); requestedQueryRef.current = normalizedQuery;
    void loadMessageSearch({ reset: true, query: normalizedQuery });
  }, [loadMessageSearch, query, requestedQueryRef, setSubmitted]);
  return { handleMessageSearchChange, handleClearMessageSearch, handleMessageSearchSubmit };
}
