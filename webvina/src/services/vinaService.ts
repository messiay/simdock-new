import type { DockingParams, DockingResult } from '../types';
import { parseVinaOutput } from '../core/utils/vinaOutputParser';

// Worker message types
export interface DockingRequest {
    type: 'dock';
    receptorPdbqt: string;
    ligandPdbqt: string;
    params: DockingParams;
}

export interface DockingProgress {
    type: 'progress';
    message: string;
    progress: number;
}

export interface DockingComplete {
    type: 'complete';
    result: DockingResult;
}

export interface DockingError {
    type: 'error';
    message: string;
}

export type WorkerMessage = DockingRequest;
export type WorkerResponse = DockingProgress | DockingComplete | DockingError;

/**
 * VinaService - Wrapper for the Vina WebAssembly module
 * Uses a Web Worker to run docking in the background
 */
class VinaService {
    private worker: Worker | null = null;
    private isInitialized = false;

    /**
     * Initialize the Vina service by loading the WASM module
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Check for SharedArrayBuffer support (required for threading)
        if (typeof SharedArrayBuffer === 'undefined') {
            throw new Error(
                'SharedArrayBuffer is not available. ' +
                'Please ensure the page is served with proper CORS headers: ' +
                'Cross-Origin-Embedder-Policy: require-corp, ' +
                'Cross-Origin-Opener-Policy: same-origin'
            );
        }

        this.isInitialized = true;
    }

    /**
     * Run molecular docking
     */
    async runDocking(
        receptorPdbqt: string,
        ligandPdbqt: string,
        params: DockingParams,
        onProgress?: (message: string, progress: number) => void
    ): Promise<DockingResult> {
        await this.initialize();

        return new Promise((resolve, reject) => {
            // Create a new worker for this docking run
            this.worker = new Worker(
                new URL('../core/workers/dockingWorker.ts', import.meta.url),
                { type: 'module' }
            );

            this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const data = event.data;

                switch (data.type) {
                    case 'progress':
                        onProgress?.(data.message, data.progress);
                        break;

                    case 'complete':
                        this.cleanupWorker();
                        resolve(data.result);
                        break;

                    case 'error':
                        this.cleanupWorker();
                        reject(new Error(data.message));
                        break;
                }
            };

            this.worker.onerror = (error) => {
                this.cleanupWorker();
                reject(new Error(`Worker error: ${error.message}`));
            };

            // Send docking request to worker
            const request: DockingRequest = {
                type: 'dock',
                receptorPdbqt,
                ligandPdbqt,
                params,
            };

            this.worker.postMessage(request);
        });
    }

    /**
     * Abort the current docking run
     */
    abort(): void {
        this.cleanupWorker();
    }

    private cleanupWorker(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

// Singleton instance
export const vinaService = new VinaService();

/**
 * Fallback: Run Vina directly without worker (for simpler testing)
 * This simulates a docking run for development purposes
 */
export async function simulateDocking(
    _receptorPdbqt: string,
    ligandPdbqt: string,
    params: DockingParams,
    onProgress?: (message: string, progress: number) => void
): Promise<DockingResult> {
    // Simulate initialization
    onProgress?.('Initializing Vina...', 5);
    await delay(500);

    // Simulate file preparation
    onProgress?.('Preparing receptor...', 15);
    await delay(300);

    onProgress?.('Preparing ligand...', 25);
    await delay(300);

    // Simulate docking
    for (let i = 0; i < 10; i++) {
        onProgress?.(`Running docking... (step ${i + 1}/10)`, 30 + i * 6);
        await delay(200);
    }

    // Simulate output
    onProgress?.('Writing output...', 95);
    await delay(200);

    onProgress?.('Docking complete!', 100);

    // Return simulated results
    const simulatedOutput = `
Detected CPU cores: ${params.cpus}
Using exhaustiveness = ${params.exhaustiveness}

mode |   affinity | dist from best mode
     | (kcal/mol) | rmsd l.b.| rmsd u.b.
-----+------------+----------+----------
   1       -7.5          0.0          0.0
   2       -7.2          1.2          2.3
   3       -6.9          2.1          3.5
   4       -6.7          1.8          2.9
   5       -6.4          3.2          4.8
`;

    const simulatedPdbqt = ligandPdbqt; // In real implementation, this would be the docked poses

    return parseVinaOutput(simulatedOutput, simulatedPdbqt);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
