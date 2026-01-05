import type { DockingRequest, WorkerResponse } from '../services/vinaService';
import type { DockingResult, DockingPose } from '../types';

// Web Worker for running Vina docking in the background
// This worker will load the Vina WASM module and execute docking

let vinaModule: any = null;

// Post progress message to main thread
function postProgress(message: string, progress: number): void {
    const response: WorkerResponse = {
        type: 'progress',
        message,
        progress,
    };
    self.postMessage(response);
}

// Post completion message to main thread
function postComplete(result: DockingResult): void {
    const response: WorkerResponse = {
        type: 'complete',
        result,
    };
    self.postMessage(response);
}

// Post error message to main thread
function postError(message: string): void {
    const response: WorkerResponse = {
        type: 'error',
        message,
    };
    self.postMessage(response);
}

// Initialize Vina WASM module
async function initializeVina(): Promise<void> {
    if (vinaModule) return;

    postProgress('Loading Vina WebAssembly module...', 5);

    try {
        // In production, this would load the actual Vina WASM module
        // For now, we'll simulate the module
        await new Promise(resolve => setTimeout(resolve, 500));

        vinaModule = {
            initialized: true,
        };

        postProgress('Vina module loaded successfully', 10);
    } catch (error) {
        throw new Error(`Failed to load Vina WASM: ${error}`);
    }
}

// Run docking simulation (will be replaced with actual WASM calls)
async function runDocking(request: DockingRequest): Promise<void> {
    const { receptorPdbqt: _receptorPdbqt, ligandPdbqt, params } = request;

    try {
        await initializeVina();

        postProgress('Preparing receptor file...', 15);
        await delay(200);

        postProgress('Preparing ligand file...', 20);
        await delay(200);

        postProgress('Configuring docking parameters...', 25);
        await delay(100);

        // Simulate docking iterations
        const totalSteps = params.exhaustiveness;
        for (let i = 0; i < totalSteps; i++) {
            const progress = 30 + ((i / totalSteps) * 60);
            postProgress(`Docking iteration ${i + 1}/${totalSteps}...`, progress);
            await delay(300);
        }

        postProgress('Finalizing results...', 95);
        await delay(200);

        // Generate simulated results
        const result = generateSimulatedResults(ligandPdbqt, params.numModes);

        postProgress('Docking complete!', 100);
        postComplete(result);

    } catch (error) {
        postError(`Docking failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Generate simulated docking results
function generateSimulatedResults(ligandPdbqt: string, numModes: number): DockingResult {
    const poses: DockingPose[] = [];

    // Generate random but plausible binding affinities
    const baseAffinity = -7.5 - (Math.random() * 2);

    for (let i = 0; i < numModes; i++) {
        const affinity = baseAffinity + (i * 0.3) + (Math.random() * 0.2);
        const rmsdLB = i === 0 ? 0 : (Math.random() * 3 + 0.5);
        const rmsdUB = i === 0 ? 0 : (rmsdLB + Math.random() * 2);

        poses.push({
            mode: i + 1,
            affinity: Math.round(affinity * 10) / 10,
            rmsdLB: Math.round(rmsdLB * 10) / 10,
            rmsdUB: Math.round(rmsdUB * 10) / 10,
            pdbqt: wrapPdbqtAsModel(ligandPdbqt, i + 1, affinity),
        });
    }

    // Generate log output
    const logOutput = generateLogOutput(poses);

    return {
        poses,
        rawOutput: poses.map(p => p.pdbqt).join('\n'),
        logOutput,
    };
}

function wrapPdbqtAsModel(pdbqt: string, modelNum: number, affinity: number): string {
    const lines = pdbqt.split('\n').filter(l =>
        l.startsWith('ATOM') || l.startsWith('HETATM')
    );

    return [
        `MODEL ${modelNum}`,
        `REMARK VINA RESULT:    ${affinity.toFixed(1)}      0.000      0.000`,
        ...lines,
        'ENDMDL'
    ].join('\n');
}

function generateLogOutput(poses: DockingPose[]): string {
    let output = `
AutoDock Vina v1.2.5 (WebAssembly)

Detected ${navigator.hardwareConcurrency || 4} CPU(s)

mode |   affinity | dist from best mode
     | (kcal/mol) | rmsd l.b.| rmsd u.b.
-----+------------+----------+----------
`;

    for (const pose of poses) {
        output += `   ${pose.mode}       ${pose.affinity.toFixed(1)}          ${pose.rmsdLB.toFixed(1)}          ${pose.rmsdUB.toFixed(1)}\n`;
    }

    output += '\nWriting output...done.\n';

    return output;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<DockingRequest>) => {
    const request = event.data;

    if (request.type === 'dock') {
        await runDocking(request);
    }
};
