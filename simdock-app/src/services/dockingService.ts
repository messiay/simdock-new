/**
 * Docking Service
 * Runs docking in a Dedicated Worker to prevent UI freezing and ensure memory isolation
 * Uses async callbacks for UI updates
 */

import {
    type DockingResult,
    type Gridbox,
    dockingJobRepository,
    dockingResultRepository
} from '../db';
import { convertToPDBQT, isPDBQT } from '../utils/pdbqtConverter';

export interface DockingConfig extends Gridbox {
    exhaustiveness: number;
    numModes: number;
}

export interface DockingCallbacks {
    onLog?: (message: string) => void;
    onProgress?: (percent: number) => void;
    onComplete?: (results: ParsedResult[], output: string, dockingTime: number) => void;
    onError?: (error: string) => void;
}

export interface ParsedResult {
    pose: number;
    score: number;
    rmsdLB: number;
    rmsdUB: number;
}

class DockingService {
    private callbacks: DockingCallbacks = {};
    private currentJobId: string | null = null;
    private isRunning = false;

    private log(msg: string) {
        console.log(msg);
        // Defer callback to keep UI responsive
        setTimeout(() => this.callbacks.onLog?.(msg), 0);
    }

    /**
     * Run a docking job 
     */
    async runDocking(
        jobId: string,
        receptorPdbqt: string,
        ligandPdbqt: string,
        _ligandId: string,
        config: DockingConfig,
        callbacks: DockingCallbacks
    ): Promise<void> {
        if (this.isRunning) {
            callbacks.onError?.('Docking already in progress');
            return;
        }

        this.callbacks = callbacks;
        this.currentJobId = jobId;
        this.isRunning = true;

        // Update job status to running
        await dockingJobRepository.updateStatus(jobId, 'running');

        // Use setTimeout to yield to UI before starting heavy work
        setTimeout(() => this.executeDocking(receptorPdbqt, ligandPdbqt, config), 10);
    }

    private async executeDocking(
        receptorPdbqt: string,
        ligandPdbqt: string,
        config: DockingConfig
    ): Promise<void> {
        this.log('[Docking] Starting Vina WASM docking...');
        this.callbacks.onProgress?.(5);

        // Convert formats if needed
        let receptorPDBQT = receptorPdbqt;
        let ligandPDBQT = ligandPdbqt;

        // Check and convert receptor (PDB -> PDBQT)
        if (!isPDBQT(receptorPdbqt)) {
            this.log('[Docking] Converting receptor PDB to PDBQT...');
            try {
                receptorPDBQT = convertToPDBQT(receptorPdbqt, 'pdb');
                this.log(`[Docking] Receptor converted: ${receptorPDBQT.split('\n').length} lines`);
            } catch (e) {
                throw new Error(`Failed to convert receptor: ${e instanceof Error ? e.message : e}`);
            }
        } else {
            this.log('[Docking] Receptor already in PDBQT format');
        }

        // Check and convert ligand (SDF/PDB -> PDBQT)
        if (!isPDBQT(ligandPdbqt)) {
            this.log('[Docking] Converting ligand to PDBQT...');
            try {
                ligandPDBQT = convertToPDBQT(ligandPdbqt, 'auto');
                this.log(`[Docking] Ligand converted: ${ligandPDBQT.split('\n').length} lines`);
            } catch (e) {
                throw new Error(`Failed to convert ligand: ${e instanceof Error ? e.message : e}`);
            }
        } else {
            this.log('[Docking] Ligand already in PDBQT format');
        }

        this.log(`[Docking] Receptor: ${receptorPDBQT.split('\n').length} lines`);
        this.log(`[Docking] Ligand: ${ligandPDBQT.split('\n').length} lines`);
        this.log(`[Docking] Grid: center(${config.centerX}, ${config.centerY}, ${config.centerZ})`);
        this.log(`[Docking] Exhaustiveness: ${config.exhaustiveness}`);

        this.callbacks.onProgress?.(10);

        try {
            this.log('[Docking] Initializing Dedicated Docking Worker...');
            this.callbacks.onProgress?.(10);

            await new Promise<void>((resolve, reject) => {
                // Initialize Worker via Vite
                const worker = new Worker(
                    new URL('../workers/vinaDockingWorker.ts', import.meta.url),
                    { type: 'module' }
                );

                this.log('[Docking] Worker started. Sending job data...');
                this.callbacks.onProgress?.(20);

                worker.onmessage = (e) => {
                    const { type, message, output, duration, error } = e.data;

                    if (type === 'log') {
                        // Forward worker logs
                        this.log(`[Worker] ${message}`);
                        // Heuristic progress updates based on logs
                        if (typeof message === 'string') {
                            if (message.includes('Scoring function')) this.callbacks.onProgress?.(30);
                            if (message.includes('Refining')) this.callbacks.onProgress?.(50);
                        }
                    } else if (type === 'complete') {
                        this.log(`[Docking] Worker finished in ${duration.toFixed(2)}s`);
                        this.callbacks.onProgress?.(90);

                        // Parse results
                        const results = this.parseVinaOutput(output);
                        this.log(`[Docking] Found ${results.length} binding poses`);

                        if (results.length > 0) {
                            this.log(`[Docking] Best score: ${results[0].score} kcal/mol`);
                        }

                        this.callbacks.onProgress?.(100);

                        // Save results
                        this.saveResults(results, output, duration)
                            .then(() => {
                                worker.terminate();
                                resolve();
                            })
                            .catch((err) => {
                                worker.terminate();
                                reject(err);
                            });

                    } else if (type === 'error') {
                        worker.terminate();
                        reject(new Error(error));
                    }
                };

                worker.onerror = (e) => {
                    worker.terminate();
                    reject(new Error(`Worker Error: ${e.message}`));
                };

                // Parameters
                const vinaParams = {
                    center_x: config.centerX,
                    center_y: config.centerY,
                    center_z: config.centerZ,
                    size_x: config.sizeX,
                    size_y: config.sizeY,
                    size_z: config.sizeZ,
                    exhaustiveness: config.exhaustiveness,
                    num_modes: config.numModes || 9,
                    seed: Math.floor(Math.random() * 100000)
                };

                // Send Job
                worker.postMessage({
                    receptor: receptorPDBQT,
                    ligand: ligandPDBQT,
                    params: vinaParams,
                    baseUrl: '/vina'
                });
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.log(`[Docking] Error: ${errorMsg}`);

            if (this.currentJobId) {
                await dockingJobRepository.updateStatus(this.currentJobId, 'failed');
            }

            this.callbacks.onError?.(errorMsg);
            this.isRunning = false;
        }
    }

    private async saveResults(
        parsedResults: ParsedResult[],
        outputPdbqt: string,
        dockingTime: number
    ): Promise<void> {
        if (!this.currentJobId) return;

        try {
            // Save results to database
            const results: Omit<DockingResult, 'id' | 'createdAt'>[] = parsedResults.map(r => ({
                jobId: this.currentJobId!,
                ligandId: 'mock-ligand',
                engine: 'vina' as const,
                pose: r.pose,
                score: r.score,
                rmsd: r.rmsdLB,
                pdbqtContent: outputPdbqt
            }));

            await dockingResultRepository.createBatch(results);
            await dockingJobRepository.updateStatus(this.currentJobId, 'completed');

            this.callbacks.onComplete?.(parsedResults, outputPdbqt, dockingTime);

        } catch (error) {
            console.error('Failed to save results:', error);
            this.callbacks.onError?.(`Failed to save results: ${error}`);
        } finally {
            this.isRunning = false;
        }
    }

    private parseVinaOutput(pdbqtContent: string): ParsedResult[] {
        const results: ParsedResult[] = [];
        const lines = pdbqtContent.split('\n');

        for (const line of lines) {
            if (line.includes('REMARK VINA RESULT:')) {
                const parts = line.split(/\s+/);
                if (parts.length >= 5) {
                    results.push({
                        pose: results.length + 1,
                        score: parseFloat(parts[3]),
                        rmsdLB: parseFloat(parts[4]),
                        rmsdUB: parts[5] ? parseFloat(parts[5]) : 0
                    });
                }
            }
        }

        return results;
    }
}

// Export singleton instance
export const dockingService = new DockingService();
