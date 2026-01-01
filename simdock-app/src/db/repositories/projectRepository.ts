/**
 * Project Repository
 * CRUD operations for project management
 */

import { db, type Project } from '../db';

export const projectRepository = {
    /**
     * Create a new project
     */
    async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
        const project: Project = {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const id = await db.projects.add(project);
        return { ...project, id: id as string };
    },

    /**
     * Get all projects, sorted by creation date (newest first)
     */
    async getAll(): Promise<Project[]> {
        return db.projects.orderBy('createdAt').reverse().toArray();
    },

    /**
     * Get a project by ID
     */
    async getById(id: string): Promise<Project | undefined> {
        return db.projects.get(id);
    },

    /**
     * Update a project
     */
    async update(id: string, updates: Partial<Project>): Promise<void> {
        await db.projects.update(id, {
            ...updates,
            updatedAt: new Date()
        });
    },

    /**
     * Delete a project and all associated data
     */
    async delete(id: string): Promise<void> {
        await db.transaction('rw',
            [db.projects, db.receptors, db.ligands, db.dockingJobs, db.dockingResults],
            async () => {
                // Get all jobs for this project
                const jobs = await db.dockingJobs.where('projectId').equals(id).toArray();
                const jobIds = jobs.map(j => j.id!);

                // Delete results for these jobs
                for (const jobId of jobIds) {
                    await db.dockingResults.where('jobId').equals(jobId).delete();
                }

                // Delete jobs
                await db.dockingJobs.where('projectId').equals(id).delete();

                // Delete ligands and receptors
                await db.ligands.where('projectId').equals(id).delete();
                await db.receptors.where('projectId').equals(id).delete();

                // Delete project
                await db.projects.delete(id);
            }
        );
    },

    /**
     * Search projects by name
     */
    async searchByName(query: string): Promise<Project[]> {
        const lowerQuery = query.toLowerCase();
        return db.projects
            .filter(p => p.name.toLowerCase().includes(lowerQuery))
            .toArray();
    }
};
