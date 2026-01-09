import { openDB, type IDBPDatabase } from 'idb';
import type { SavedProject } from '../core/types';

const DB_NAME = 'SimDockDB';
const STORE_NAME = 'projects';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = async () => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('username', 'username');
                    store.createIndex('timestamp', 'timestamp');
                }
            },
        });
    }
    return dbPromise;
};

export const projectService = {
    async saveProject(project: SavedProject): Promise<void> {
        const db = await getDB();
        await db.put(STORE_NAME, project);
    },

    async getProjects(username: string): Promise<SavedProject[]> {
        const db = await getDB();
        const all = await db.getAllFromIndex(STORE_NAME, 'username', username);
        // Sort by timestamp desc (newest first)
        return all.sort((a, b) => b.timestamp - a.timestamp);
    },

    async deleteProject(id: string): Promise<void> {
        const db = await getDB();
        await db.delete(STORE_NAME, id);
    },

    async loadProject(id: string): Promise<SavedProject | undefined> {
        const db = await getDB();
        return db.get(STORE_NAME, id);
    }
};
