/**
 * SimDock Pro - Database Schema (db.ts)
 * 
 * Local-first persistence layer using Dexie.js for IndexedDB abstraction.
 * Implements "Git for Proteins" receptor versioning.
 * 
 * Zero Data Egress: All data stored locally in browser's IndexedDB.
 */

import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Type Definitions
// ============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type DockingEngine = 'vina' | 'smina';

export interface Gridbox {
    centerX: number;
    centerY: number;
    centerZ: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
}

export interface EngineConfig {
    exhaustiveness: number;
    numModes: number;
    energyRange: number;
    cpuCount?: number;
}

// ============================================================================
// Entity Interfaces
// ============================================================================

export interface Project {
    id?: string;
    name: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Receptor {
    id?: string;
    projectId: string;
    name: string;
    pdbId?: string;

    // "Git for Proteins" versioning
    version: number;
    parentVersionId?: string;  // Links to previous version (null for root)

    pdbqtContent: string;
    gridbox?: Gridbox;
    createdAt: Date;
}

export interface Ligand {
    id?: string;
    projectId: string;
    name: string;
    smiles?: string;
    pubchemCid?: number;
    pdbqtContent: string;
    createdAt: Date;
}

export interface DockingJob {
    id?: string;
    projectId: string;
    receptorId: string;
    receptorVersionId: string;  // Frozen receptor version for reproducibility

    status: JobStatus;
    engines: DockingEngine[];
    config: EngineConfig;

    createdAt: Date;
    completedAt?: Date;
}

export interface DockingResult {
    id?: string;
    jobId: string;
    ligandId: string;
    engine: DockingEngine;

    pose: number;
    score: number;           // Individual engine score (kcal/mol)
    consensusScore?: number; // Computed consensus score
    rmsd: number;

    pdbqtContent: string;
    createdAt: Date;
}

// ============================================================================
// Database Class
// ============================================================================

export class SimDockDatabase extends Dexie {
    // Table declarations
    projects!: Table<Project>;
    receptors!: Table<Receptor>;
    ligands!: Table<Ligand>;
    dockingJobs!: Table<DockingJob>;
    dockingResults!: Table<DockingResult>;

    constructor() {
        super('SimDockPro');

        // Schema version 1
        this.version(1).stores({
            // Primary key is 'id', indexed fields follow
            projects: 'id, name, createdAt',

            // Compound index [projectId+name] for per-project lookups
            receptors: 'id, projectId, name, version, parentVersionId, [projectId+name]',

            ligands: 'id, projectId, name, pubchemCid, [projectId+name]',

            // Index by status for filtering active/completed jobs
            dockingJobs: 'id, projectId, receptorId, status, [projectId+status]',

            // Dual indexes for result retrieval and score ranking
            dockingResults: 'id, jobId, ligandId, engine, [jobId+ligandId], [jobId+score]'
        });

        // Add hooks for auto-generating UUIDs
        this.projects.hook('creating', (_primKey, obj) => {
            if (!obj.id) obj.id = uuidv4();
            if (!obj.createdAt) obj.createdAt = new Date();
            if (!obj.updatedAt) obj.updatedAt = new Date();
            return obj.id;
        });

        this.receptors.hook('creating', (_primKey, obj) => {
            if (!obj.id) obj.id = uuidv4();
            if (!obj.version) obj.version = 1;
            if (!obj.createdAt) obj.createdAt = new Date();
            return obj.id;
        });

        this.ligands.hook('creating', (_primKey, obj) => {
            if (!obj.id) obj.id = uuidv4();
            if (!obj.createdAt) obj.createdAt = new Date();
            return obj.id;
        });

        this.dockingJobs.hook('creating', (_primKey, obj) => {
            if (!obj.id) obj.id = uuidv4();
            if (!obj.createdAt) obj.createdAt = new Date();
            if (!obj.status) obj.status = 'pending';
            return obj.id;
        });

        this.dockingResults.hook('creating', (_primKey, obj) => {
            if (!obj.id) obj.id = uuidv4();
            if (!obj.createdAt) obj.createdAt = new Date();
            return obj.id;
        });
    }
}

// ============================================================================
// Singleton Database Instance
// ============================================================================

export const db = new SimDockDatabase();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new version of a receptor (Git for Proteins)
 * @param parentId - ID of the parent receptor version
 * @param updates - Partial receptor fields to update
 * @returns The newly created receptor version
 */
export async function createReceptorVersion(
    parentId: string,
    updates: Partial<Pick<Receptor, 'pdbqtContent' | 'gridbox'>>
): Promise<Receptor> {
    const parent = await db.receptors.get(parentId);
    if (!parent) {
        throw new Error(`Parent receptor not found: ${parentId}`);
    }

    const newVersion: Receptor = {
        projectId: parent.projectId,
        name: parent.name,
        pdbId: parent.pdbId,
        version: parent.version + 1,
        parentVersionId: parentId,
        pdbqtContent: updates.pdbqtContent ?? parent.pdbqtContent,
        gridbox: updates.gridbox ?? parent.gridbox,
        createdAt: new Date()
    };

    const id = await db.receptors.add(newVersion);
    return { ...newVersion, id: id as string };
}

/**
 * Get version history for a receptor
 * @param receptorId - ID of any receptor in the version chain
 * @returns Array of receptors from root to current, ordered by version
 */
export async function getReceptorVersionHistory(
    receptorId: string
): Promise<Receptor[]> {
    const receptor = await db.receptors.get(receptorId);
    if (!receptor) return [];

    // Get all versions with same projectId and name
    const versions = await db.receptors
        .where('[projectId+name]')
        .equals([receptor.projectId, receptor.name])
        .toArray();

    // Sort by version number
    return versions.sort((a, b) => a.version - b.version);
}

/**
 * Get the latest version of a receptor by name
 */
export async function getLatestReceptorVersion(
    projectId: string,
    receptorName: string
): Promise<Receptor | undefined> {
    const versions = await db.receptors
        .where('[projectId+name]')
        .equals([projectId, receptorName])
        .toArray();

    if (versions.length === 0) return undefined;

    return versions.reduce((latest, current) =>
        current.version > latest.version ? current : latest
    );
}
