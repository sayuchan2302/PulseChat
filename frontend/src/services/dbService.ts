import type { ChatMessage, PendingMedia, SendMessagePayload, SendRoomMessagePayload } from '../types/chat.types';
import type { ChatRoom, User, Message } from '../types';

const DB_NAME = 'ChatAppOfflineDB';
const DB_VERSION = 2;
const STORES = ['conversations', 'messages', 'pendingQueue'];
type ConversationsCache = { rooms: ChatRoom[]; users: User[] };

export interface OfflinePendingMessage {
    id: string;
    destination: string;
    body: SendMessagePayload | SendRoomMessagePayload;
    conversationKey?: string;
    optimistic?: ChatMessage;
    failed?: boolean;
    attachment?: PendingMedia;
    timestamp: number;
}

export class DBService {
    private dbPromise: Promise<IDBDatabase> | null = null;
    private activeUserId: number | null = null;
    private generation = 0;

    setActiveUser(userId: number | null) {
        this.activeUserId = userId;
        this.generation += 1;
    }

    private getDB(): Promise<IDBDatabase> {
        if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not supported'));
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                // Version 1 records have no owner. Never attribute them to the next login.
                for (const name of STORES) {
                    if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
                    const store = db.createObjectStore(name, {
                        keyPath: ['userId', name === 'conversations' ? 'key' : 'id'],
                    });
                    store.createIndex('userId', 'userId');
                    if (name === 'messages') store.createIndex('conversation', ['userId', 'conversationKey']);
                }
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => {
                    request.result.close();
                    this.dbPromise = null;
                };
                resolve(request.result);
            };
            request.onerror = () => { this.dbPromise = null; reject(request.error); };
        });
        return this.dbPromise;
    }

    private async run<T>(userId: number, storeName: string, mode: IDBTransactionMode,
        action: (store: IDBObjectStore) => IDBRequest<T> | void, fallback: T): Promise<T> {
        const generation = this.generation;
        if (this.activeUserId !== userId) return fallback;
        try {
            const db = await this.getDB();
            if (this.activeUserId !== userId || generation !== this.generation) return fallback;
            return await new Promise<T>((resolve) => {
                const tx = db.transaction(storeName, mode);
                const request = action(tx.objectStore(storeName));
                tx.oncomplete = () => resolve(this.activeUserId === userId && generation === this.generation
                    ? request?.result ?? fallback : fallback);
                tx.onabort = () => resolve(fallback);
                tx.onerror = () => resolve(fallback);
            });
        } catch {
            return fallback;
        }
    }

    async saveConversationsCache(userId: number, key: string, data: ConversationsCache): Promise<void> {
        await this.run(userId, 'conversations', 'readwrite', (store) => {
            store.put({ userId, key, ...data, timestamp: Date.now() });
        }, undefined);
    }

    async getConversationsCache(userId: number, key: string): Promise<ConversationsCache | null> {
        return this.run<ConversationsCache | null>(userId, 'conversations', 'readonly',
            (store) => store.get([userId, key]), null);
    }

    async saveMessagesCache(userId: number, conversationKey: string, messages: Message[]): Promise<void> {
        await this.run(userId, 'messages', 'readwrite', (store) => {
            for (const message of messages) {
                if (message.id > 0) store.put({ ...message, userId, conversationKey });
            }
        }, undefined);
    }

    /**
     * Replaces an authoritative ID window. Passing no bounds clears the entire
     * conversation; bounded replacement keeps cached history outside that window.
     */
    async replaceMessagesCache(
        userId: number,
        conversationKey: string,
        messages: Message[],
        lowerBound?: number,
        upperBound?: number,
    ): Promise<void> {
        await this.run(userId, 'messages', 'readwrite', (store) => {
            const cursor = store.index('conversation').openCursor([userId, conversationKey]);
            cursor.onsuccess = () => {
                if (cursor.result) {
                    const id = cursor.result.value.id as number;
                    const replacesEverything = lowerBound === undefined && upperBound === undefined;
                    if (replacesEverything || (id >= lowerBound! && id <= upperBound!)) cursor.result.delete();
                    cursor.result.continue();
                }
                else for (const message of messages) {
                    if (message.id > 0) store.put({ ...message, userId, conversationKey });
                }
            };
        }, undefined);
    }

    async getMessagesCache(userId: number, conversationKey: string): Promise<Message[]> {
        const messages = await this.run<Message[]>(userId, 'messages', 'readonly',
            (store) => store.index('conversation').getAll([userId, conversationKey]), []);
        return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    async enqueuePendingMessage(userId: number, item: OfflinePendingMessage): Promise<boolean> {
        return Boolean(await this.run<IDBValidKey>(userId, 'pendingQueue', 'readwrite',
            (store) => store.put({ ...item, userId }), ''));
    }

    async getPendingQueue(userId: number): Promise<OfflinePendingMessage[]> {
        return this.run<OfflinePendingMessage[]>(userId, 'pendingQueue', 'readonly',
            (store) => store.index('userId').getAll(userId), []);
    }

    async removePendingMessage(userId: number, id: string): Promise<void> {
        await this.run(userId, 'pendingQueue', 'readwrite', (store) => { store.delete([userId, id]); }, undefined);
    }

    async clearUser(userId: number): Promise<void> {
        if (this.activeUserId === userId) this.setActiveUser(null);
        try {
            const db = await this.getDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORES, 'readwrite');
                for (const name of STORES) {
                    const request = tx.objectStore(name).index('userId').openCursor(userId);
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (cursor) { cursor.delete(); cursor.continue(); }
                    };
                }
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error);
            });
        } catch { /* Cache cleanup must not prevent logout. */ }
    }
}

export const dbService = new DBService();
export default dbService;
