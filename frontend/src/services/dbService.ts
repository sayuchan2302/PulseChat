import type { ChatRoom, User, Message } from '../types';

const DB_NAME = 'ChatAppOfflineDB';
const DB_VERSION = 1;

export interface OfflinePendingMessage {
    id: string;
    destination: string;
    body: unknown;
    timestamp: number;
}

class DBService {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private getDB(): Promise<IDBDatabase> {
        if (typeof window === 'undefined' || !('indexedDB' in window)) {
            return Promise.reject(new Error('IndexedDB is not supported'));
        }

        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('conversations')) {
                    db.createObjectStore('conversations', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                    messageStore.createIndex('conversationKey', 'conversationKey', { unique: false });
                }
                if (!db.objectStoreNames.contains('pendingQueue')) {
                    db.createObjectStore('pendingQueue', { keyPath: 'id' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return this.dbPromise;
    }

    public async saveConversationsCache(key: string, data: { rooms: ChatRoom[]; users: User[] }): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('conversations', 'readwrite');
            const store = tx.objectStore('conversations');
            store.put({ key, ...data, timestamp: Date.now() });
        } catch (err) {
            console.warn('[DBService] Failed to save conversations cache:', err);
        }
    }

    public async getConversationsCache(key: string): Promise<{ rooms: ChatRoom[]; users: User[] } | null> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('conversations', 'readonly');
            const store = tx.objectStore('conversations');
            const result = await new Promise<any>((resolve) => {
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
            if (result && result.rooms && result.users) {
                return { rooms: result.rooms, users: result.users };
            }
            return null;
        } catch {
            return null;
        }
    }

    public async saveMessagesCache(conversationKey: string, messages: Message[]): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            for (const msg of messages) {
                if (msg.id > 0) {
                    store.put({ ...msg, conversationKey });
                }
            }
        } catch (err) {
            console.warn('[DBService] Failed to save messages cache:', err);
        }
    }

    public async getMessagesCache(conversationKey: string): Promise<Message[]> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('messages', 'readonly');
            const store = tx.objectStore('messages');
            const index = store.index('conversationKey');

            return await new Promise<Message[]>((resolve) => {
                const req = index.getAll(conversationKey);
                req.onsuccess = () => {
                    const res: Message[] = req.result || [];
                    res.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    resolve(res);
                };
                req.onerror = () => resolve([]);
            });
        } catch {
            return [];
        }
    }

    public async enqueuePendingMessage(item: OfflinePendingMessage): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('pendingQueue', 'readwrite');
            tx.objectStore('pendingQueue').put(item);
        } catch (err) {
            console.warn('[DBService] Failed to enqueue pending message:', err);
        }
    }

    public async getPendingQueue(): Promise<OfflinePendingMessage[]> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('pendingQueue', 'readonly');
            const store = tx.objectStore('pendingQueue');

            return await new Promise<OfflinePendingMessage[]>((resolve) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch {
            return [];
        }
    }

    public async removePendingMessage(id: string): Promise<void> {
        try {
            const db = await this.getDB();
            const tx = db.transaction('pendingQueue', 'readwrite');
            tx.objectStore('pendingQueue').delete(id);
        } catch (err) {
            console.warn('[DBService] Failed to remove pending message:', err);
        }
    }
}

export const dbService = new DBService();
export default dbService;
