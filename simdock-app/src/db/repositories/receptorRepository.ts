/**
 * Receptor Repository
 * CRUD operations with "Git for Proteins" version control
 */

import {
    db,
    type Receptor,
    type Gridbox,
    createReceptorVersion,
    getReceptorVersionHistory,
    getLatestReceptorVersion
} from '../db';

export const receptorRepository = {
    /**
     * Create a new receptor (version 1)
     */
    async create(data: Omit<Receptor, 'id' | 'version' | 'createdAt'>): Promise<Receptor> {
        const receptor: Receptor = {
            ...data,
            version: 1,
            createdAt: new Date()
        };
        const id = await db.receptors.add(receptor);
        return { ...receptor, id: id as string };
    },

    /**
     * Get all receptors for a project (latest versions only)
     */
    async getByProject(projectId: string): Promise<Receptor[]> {
        // Get all receptors for project
        const all = await db.receptors
            .where('projectId')
            .equals(projectId)
            .toArray();

        // Group by name and return only latest versions
        const latestByName = new Map<string, Receptor>();
        for (const receptor of all) {
            const existing = latestByName.get(receptor.name);
            if (!existing || receptor.version > existing.version) {
                latestByName.set(receptor.name, receptor);
            }
        }

        return Array.from(latestByName.values());
    },

    /**
     * Get a receptor by ID
     */
    async getById(id: string): Promise<Receptor | undefined> {
        return db.receptors.get(id);
    },

    /**
     * Create a new version of a receptor (Git for Proteins)
     */
    async createVersion(
        parentId: string,
        updates: { pdbqtContent?: string; gridbox?: Gridbox }
    ): Promise<Receptor> {
        return createReceptorVersion(parentId, updates);
    },

    /**
     * Get version history for a receptor
     */
    async getVersionHistory(receptorId: string): Promise<Receptor[]> {
        return getReceptorVersionHistory(receptorId);
    },

    /**
     * Get the latest version of a receptor by name
     */
    async getLatestVersion(projectId: string, name: string): Promise<Receptor | undefined> {
        return getLatestReceptorVersion(projectId, name);
    },

    /**
     * Get version tree (for visualization)
     */
    async getVersionTree(receptorId: string): Promise<{
        node: Receptor;
        children: Receptor[];
    } | null> {
        const receptor = await db.receptors.get(receptorId);
        if (!receptor) return null;

        // Find children (receptors where parentVersionId = this receptor's id)
        const children = await db.receptors
            .where('parentVersionId')
            .equals(receptorId)
            .toArray();

        return { node: receptor, children };
    },

    /**
     * Update gridbox for a receptor (creates new version)
     */
    async updateGridbox(receptorId: string, gridbox: Gridbox): Promise<Receptor> {
        return this.createVersion(receptorId, { gridbox });
    },

    /**
     * Delete all versions of a receptor
     */
    async deleteAll(projectId: string, name: string): Promise<void> {
        await db.receptors
            .where('[projectId+name]')
            .equals([projectId, name])
            .delete();
    }
};
