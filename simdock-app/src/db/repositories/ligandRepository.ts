/**
 * Ligand Repository
 * CRUD operations for ligand management
 */

import { db, type Ligand } from '../db';

export const ligandRepository = {
    /**
     * Create a new ligand
     */
    async create(data: Omit<Ligand, 'id' | 'createdAt'>): Promise<Ligand> {
        const ligand: Ligand = {
            ...data,
            createdAt: new Date()
        };
        const id = await db.ligands.add(ligand);
        return { ...ligand, id: id as string };
    },

    /**
     * Create multiple ligands (batch import)
     */
    async createBatch(ligands: Omit<Ligand, 'id' | 'createdAt'>[]): Promise<Ligand[]> {
        const created: Ligand[] = [];

        await db.transaction('rw', db.ligands, async () => {
            for (const data of ligands) {
                const ligand: Ligand = {
                    ...data,
                    createdAt: new Date()
                };
                const id = await db.ligands.add(ligand);
                created.push({ ...ligand, id: id as string });
            }
        });

        return created;
    },

    /**
     * Get all ligands for a project
     */
    async getByProject(projectId: string): Promise<Ligand[]> {
        return db.ligands
            .where('projectId')
            .equals(projectId)
            .toArray();
    },

    /**
     * Get a ligand by ID
     */
    async getById(id: string): Promise<Ligand | undefined> {
        return db.ligands.get(id);
    },

    /**
     * Get ligands by PubChem CID
     */
    async getByPubchemCid(cid: number): Promise<Ligand[]> {
        return db.ligands
            .where('pubchemCid')
            .equals(cid)
            .toArray();
    },

    /**
     * Update a ligand
     */
    async update(id: string, updates: Partial<Ligand>): Promise<void> {
        await db.ligands.update(id, updates);
    },

    /**
     * Delete a ligand
     */
    async delete(id: string): Promise<void> {
        // Also delete associated docking results
        await db.transaction('rw', [db.ligands, db.dockingResults], async () => {
            await db.dockingResults.where('ligandId').equals(id).delete();
            await db.ligands.delete(id);
        });
    },

    /**
     * Search ligands by name or SMILES
     */
    async search(projectId: string, query: string): Promise<Ligand[]> {
        const lowerQuery = query.toLowerCase();
        return db.ligands
            .where('projectId')
            .equals(projectId)
            .filter(l =>
                l.name.toLowerCase().includes(lowerQuery) ||
                (l.smiles?.toLowerCase().includes(lowerQuery) ?? false)
            )
            .toArray();
    },

    /**
     * Get ligand count for a project
     */
    async countByProject(projectId: string): Promise<number> {
        return db.ligands
            .where('projectId')
            .equals(projectId)
            .count();
    }
};
