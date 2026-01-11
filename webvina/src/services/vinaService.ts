import type { DockingParams, DockingResult } from '../types';
import { runWebinaVina } from './webinaBridge';
import { useDockingStore } from '../store/dockingStore';

// Worker message types (kept for backward compatibility)
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

// Re-export DockingParams from types for convenience
export type { DockingParams } from '../types';

/**
 * VinaService - Wrapper for the Vina WebAssembly module
 * 
 * Now uses Webina (DurrantLab AutoDock Vina WASM) loaded from main thread.
 * Webina handles its own internal worker threading via SharedArrayBuffer.
 * 
 * This is REAL Vina WASM execution - NO SIMULATION
 */
class VinaService {
    private isInitialized = false;
    private abortController: AbortController | null = null;

    /**
     * Initialize the Vina service
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

        console.log('[VinaService] Initialized - using Webina (DurrantLab AutoDock Vina WASM)');
        this.isInitialized = true;
    }

    /**
     * Run molecular docking using REAL Vina WASM (via Webina)
     * NO SIMULATION - ALL REAL COMPUTATION
     */
    async runDocking(
        receptorPdbqt: string,
        ligandPdbqt: string,
        params: DockingParams,
        onProgress?: (message: string, progress: number) => void
    ): Promise<DockingResult> {
        await this.initialize();

        console.log('[VinaService] Starting REAL Vina WASM docking via Webina');
        console.log('[VinaService] Receptor size:', receptorPdbqt.length, 'chars');
        console.log('[VinaService] Ligand size:', ligandPdbqt.length, 'chars');
        console.log('[VinaService] Parameters:', params);

        // Use Webina bridge for REAL docking
        return runWebinaVina(receptorPdbqt, ligandPdbqt, params, {
            onProgress: (msg, pct) => {
                onProgress?.(msg, pct);
                // Also log progress to diary
                useDockingStore.getState().addConsoleOutput(`[PROGRESS] ${msg}`);
            },
            onStdout: (msg) => {
                useDockingStore.getState().addConsoleOutput(msg);
            },
            onStderr: (msg) => {
                useDockingStore.getState().addConsoleOutput(`[STDERR] ${msg}`);
            }
        });
    }

    /**
     * Abort the current docking run
     * Note: Webina docking cannot be easily aborted once started
     */
    abort(): void {
        console.log('[VinaService] Abort requested (note: Webina docking may not be abortable once started)');
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// Singleton instance
export const vinaService = new VinaService();

// NOTE: simulateDocking() has been REMOVED
// The docking pipeline now ONLY uses real Vina WASM via Webina
// All computation is real - no synthetic/simulated/fake data

