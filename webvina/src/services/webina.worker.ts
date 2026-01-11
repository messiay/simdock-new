
// Web Worker for running AutoDock Vina WASM
// This moves the blocking WASM execution off the main thread to avoid Uncaught 280032 (EAGAIN)

interface WorkerMessage {
    type: 'init' | 'run' | 'abort';
    payload?: any;
}

interface RunPayload {
    receptor: string;
    ligand: string;
    args: string[];
}

const WASM_BASE = "/webina/";

// Global state
let vinaModule: any = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { type, payload } = e.data;

    try {
        switch (type) {
            case 'init':
                await initializeVina();
                self.postMessage({ type: 'init_complete' });
                break;

            case 'run':
                await runVina(payload);
                break;

            case 'abort':
                console.warn("Worker received abort request");
                break;
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', payload: err.message || String(err) });
    }
};

async function initializeVina() {
    if (vinaModule) return;

    self.postMessage({ type: 'progress', payload: { message: "Loading WASM Engine...", percent: 5 } });

    const cacheBuster = Date.now();
    const scriptUrl = `${self.location.origin}${WASM_BASE}vina.js?t=${cacheBuster}`;

    console.log(`[Worker] Importing vina.js from ${scriptUrl}`);

    /* @vite-ignore */
    const mod = await import(scriptUrl);
    const moduleFactory = mod.default;

    if (!moduleFactory) {
        throw new Error("vina.js default export not found");
    }

    vinaModule = await moduleFactory({
        noInitialRun: true,
        // REMOVED PTHREAD_POOL_SIZE restriction to allow default threading behavior in Worker
        // PTHREAD_POOL_SIZE: 0, 
        // PTHREAD_POOL_SIZE_STRICT: 0,

        locateFile: (path: string) => {
            return `${self.location.origin}${WASM_BASE}${path}?t=${cacheBuster}`;
        },
        print: (text: string) => {
            self.postMessage({ type: 'stdout', payload: text });

            if (text.includes('Computing Vina grid')) self.postMessage({ type: 'progress', payload: { message: "Grid calculation...", percent: 20 } });
            if (text.includes('Performing docking')) self.postMessage({ type: 'progress', payload: { message: "Docking...", percent: 50 } });
            if (text.includes('Refining results')) self.postMessage({ type: 'progress', payload: { message: "Refining...", percent: 90 } });
        },
        printErr: (text: string) => {
            console.warn(`[Vina STDERR] ${text}`);
            self.postMessage({ type: 'stderr', payload: text });
        },
        onExit: (code: number) => {
            console.log(`[Worker] Vina exited with code ${code}`);
        }
    });

    self.postMessage({ type: 'progress', payload: { message: "Engine Initialized", percent: 10 } });
}

async function runVina(params: RunPayload) {
    if (!vinaModule) await initializeVina();

    const { receptor, ligand, args } = params;

    vinaModule.FS.writeFile('/receptor.pdbqt', receptor);
    vinaModule.FS.writeFile('/ligand.pdbqt', ligand);

    self.postMessage({ type: 'progress', payload: { message: "Starting Job...", percent: 15 } });

    // Ensure all paths are virtual
    const fullArgs = [...args, '--receptor', '/receptor.pdbqt', '--ligand', '/ligand.pdbqt', '--out', '/output.pdbqt'];

    console.log(`[Worker] Calling callMain with:`, fullArgs);

    try {
        vinaModule.callMain(fullArgs);

        let outputPdbqt = "";
        try {
            outputPdbqt = vinaModule.FS.readFile('/output.pdbqt', { encoding: 'utf8' });
        } catch (e) {
            console.warn("[Worker] Could not read /output.pdbqt (Docking likely failed/No poses)");
        }

        self.postMessage({ type: 'done', payload: { pdbqt: outputPdbqt } });

    } catch (e: any) {
        console.error("[Worker] callMain Logic Error:", e);

        // Fix: Vina might throw an internal ExitStatus which is how it signals completion
        if (e.name === "ExitStatus" || e.message === "ExitStatus" || (typeof e === 'number')) {
            let outputPdbqt = "";
            try {
                outputPdbqt = vinaModule.FS.readFile('/output.pdbqt', { encoding: 'utf8' });
            } catch (readErr) {
                console.warn("[Worker] Could not read output file after exit");
            }
            self.postMessage({ type: 'done', payload: { pdbqt: outputPdbqt } });
        } else {
            // Explicitly post error instead of crashing worker
            // Use JSON.stringify just in case e is not an Error object
            const errorMsg = e.message || String(e);
            self.postMessage({ type: 'error', payload: `Internal Vina Error: ${errorMsg}` });
        }
    }
}
