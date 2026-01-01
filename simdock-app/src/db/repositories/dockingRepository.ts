/**
 * Docking Job Repository
 * CRUD operations for docking jobs and results
 */

import {
    db,
    type DockingJob,
    type DockingResult
} from '../db';

export const dockingJobRepository = {
    /**
     * Create a new docking job
     */
    async create(data: Omit<DockingJob, 'id' | 'status' | 'createdAt'>): Promise<DockingJob> {
        const job: DockingJob = {
            ...data,
            status: 'pending',
            createdAt: new Date()
        };
        const id = await db.dockingJobs.add(job);
        return { ...job, id: id as string };
    },

    /**
     * Get all jobs for a project
     */
    async getByProject(projectId: string): Promise<DockingJob[]> {
        return db.dockingJobs
            .where('projectId')
            .equals(projectId)
            .reverse()
            .sortBy('createdAt');
    },

    /**
     * Get jobs by status
     */
    async getByStatus(projectId: string, status: DockingJob['status']): Promise<DockingJob[]> {
        return db.dockingJobs
            .where('[projectId+status]')
            .equals([projectId, status])
            .toArray();
    },

    /**
     * Get a job by ID
     */
    async getById(id: string): Promise<DockingJob | undefined> {
        return db.dockingJobs.get(id);
    },

    /**
     * Update job status
     */
    async updateStatus(id: string, status: DockingJob['status']): Promise<void> {
        const updates: Partial<DockingJob> = { status };
        if (status === 'completed' || status === 'failed') {
            updates.completedAt = new Date();
        }
        await db.dockingJobs.update(id, updates);
    },

    /**
     * Delete a job and its results
     */
    async delete(id: string): Promise<void> {
        await db.transaction('rw', [db.dockingJobs, db.dockingResults], async () => {
            await db.dockingResults.where('jobId').equals(id).delete();
            await db.dockingJobs.delete(id);
        });
    },

    /**
     * Get pending jobs count
     */
    async getPendingCount(projectId: string): Promise<number> {
        return db.dockingJobs
            .where('[projectId+status]')
            .equals([projectId, 'pending'])
            .count();
    }
};

export const dockingResultRepository = {
    /**
     * Add a docking result
     */
    async create(data: Omit<DockingResult, 'id' | 'createdAt'>): Promise<DockingResult> {
        const result: DockingResult = {
            ...data,
            createdAt: new Date()
        };
        const id = await db.dockingResults.add(result);
        return { ...result, id: id as string };
    },

    /**
     * Add multiple results (batch)
     */
    async createBatch(results: Omit<DockingResult, 'id' | 'createdAt'>[]): Promise<DockingResult[]> {
        const created: DockingResult[] = [];

        await db.transaction('rw', db.dockingResults, async () => {
            for (const data of results) {
                const result: DockingResult = {
                    ...data,
                    createdAt: new Date()
                };
                const id = await db.dockingResults.add(result);
                created.push({ ...result, id: id as string });
            }
        });

        return created;
    },

    /**
     * Get results for a job
     */
    async getByJob(jobId: string): Promise<DockingResult[]> {
        return db.dockingResults
            .where('jobId')
            .equals(jobId)
            .toArray();
    },

    /**
     * Get results for a specific ligand in a job
     */
    async getByJobAndLigand(jobId: string, ligandId: string): Promise<DockingResult[]> {
        return db.dockingResults
            .where('[jobId+ligandId]')
            .equals([jobId, ligandId])
            .toArray();
    },

    /**
     * Get best result for each ligand in a job (by score)
     */
    async getBestByJob(jobId: string): Promise<DockingResult[]> {
        const allResults = await db.dockingResults
            .where('jobId')
            .equals(jobId)
            .toArray();

        // Group by ligandId and get best score
        const bestByLigand = new Map<string, DockingResult>();
        for (const result of allResults) {
            const existing = bestByLigand.get(result.ligandId);
            if (!existing || result.score < existing.score) {
                bestByLigand.set(result.ligandId, result);
            }
        }

        return Array.from(bestByLigand.values()).sort((a, b) => a.score - b.score);
    },

    /**
     * Get results ranked by score
     */
    async getRankedByScore(jobId: string, limit = 100): Promise<DockingResult[]> {
        const results = await db.dockingResults
            .where('jobId')
            .equals(jobId)
            .toArray();

        return results.sort((a, b) => a.score - b.score).slice(0, limit);
    },

    /**
     * Update consensus score
     */
    async updateConsensusScore(id: string, consensusScore: number): Promise<void> {
        await db.dockingResults.update(id, { consensusScore });
    },

    /**
     * Delete all results for a job
     */
    async deleteByJob(jobId: string): Promise<void> {
        await db.dockingResults.where('jobId').equals(jobId).delete();
    }
};
