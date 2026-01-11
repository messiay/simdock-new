
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
let abortController: AbortController | null = null; // Not really usable with synchronous Vina, but good for cleanup

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
                // Vina doesn't support true aborting once callMain starts (synchronous), 
                // but we can reject the current run if it was async or setting flags
                console.warn("Worker received abort request - note: Vina might not stop immediately if blocking");
                // Force terminate logic is usually done by terminate() on the worker instance from main thread
                break;
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', payload: err.message || String(err) });
    }
};

async function initializeVina() {
    // If already initialized, just return
    if (vinaModule) return;

    self.postMessage({ type: 'progress', payload: { message: "Loading WASM Engine...", percent: 5 } });

    // Import vina.js
    // Note: Vite will handle this import for the worker bundle
    // construction of URL might depend on build system, but standard import should work if configured
    // Fallback to importScripts if needed, but 'vina.js' is in public folder. 
    // For dynamic import from public folder in a worker usually requires absolute URL

    const cacheBuster = Date.now();
    const scriptUrl = `${self.location.origin}${WASM_BASE}vina.js?t=${cacheBuster}`;

    console.log(`[Worker] Importing vina.js from ${scriptUrl}`);

    // Dynamic import for ES module support
    const mod = await import(scriptUrl);
    const moduleFactory = mod.default;

    if (!moduleFactory) {
        throw new Error("vina.js default export not found");
    }

    vinaModule = await moduleFactory({
        noInitialRun: true,
        // IMPORTANT: We CAN use pthreads here because we are in a Worker,
        // but if the compilation requires SharedArrayBuffer and headers are missing, it might still fail.
        // However, 280032 is usually "Main thread blocked".
        // Let's try with default pool size first, or explicit 0 if we want to risk it safely.
        // User had issues with threads, so keeping safe for now but potentially enabling later.
        // Actually, standard Vina WASM *is* threaded.
        // If we are in a worker, we should be allowed to block.
        // Let's try NOT preventing the pool first (default behavior), 
        // OR set it to 4 if explicit needed. 
        // Safest: PTHREAD_POOL_SIZE: 0 (Single threaded inside worker) to verify architecture fix first.
        PTHREAD_POOL_SIZE: 0,
        PTHREAD_POOL_SIZE_STRICT: 0,

        locateFile: (path: string) => {
            return `${self.location.origin}${WASM_BASE}${path}?t=${cacheBuster}`;
        },
        print: (text: string) => {
            self.postMessage({ type: 'stdout', payload: text });

            // Heuristics
            if (text.includes('Computing Vina grid')) self.postMessage({ type: 'progress', payload: { message: "Grid calculation...", percent: 20 } });
            if (text.includes('Performing docking')) self.postMessage({ type: 'progress', payload: { message: "Docking...", percent: 50 } });
            if (text.includes('Refining results')) self.postMessage({ type: 'progress', payload: { message: "Refining...", percent: 90 } });
        },
        printErr: (text: string) => {
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

    // Write files
    vinaModule.FS.writeFile('/receptor.pdbqt', receptor);
    vinaModule.FS.writeFile('/ligand.pdbqt', ligand);

    // Run
    self.postMessage({ type: 'progress', payload: { message: "Starting Job...", percent: 15 } });

    // Command line arguments
    // Ensure all paths are virtual
    const fullArgs = [...args, '--receptor', '/receptor.pdbqt', '--ligand', '/ligand.pdbqt', '--out', '/output.pdbqt'];

    console.log(`[Worker] Calling callMain with:`, fullArgs);

    try {
        vinaModule.callMain(fullArgs);

        // After callMain returns (synchronous in this build likely), read output
        // If it was async (threaded build), we might need to wait on onExit?
        // But 280032 usually implies it TRIED to be async/blocking on main thread.
        // In worker, we can assume it finishes or we wait.
        // Assuming synchronous finish for now based on 'cpu=1'.

        let outputPdbqt = "";
        try {
            outputPdbqt = vinaModule.FS.readFile('/output.pdbqt', { encoding: 'utf8' });
        } catch (e) {
            console.warn("Could not read output file");
        }

        self.postMessage({ type: 'done', payload: { pdbqt: outputPdbqt } });

    } catch (e: any) {
        if (e.name === "ExitStatus") {
            // Normal exit catch
            // We can check exit code if accessible, but usually we just proceed
            let outputPdbqt = "";
            try {
                outputPdbqt = vinaModule.FS.readFile('/output.pdbqt', { encoding: 'utf8' });
            } catch (readErr) {
                console.warn("Could not read output file after exit");
            }
            self.postMessage({ type: 'done', payload: { pdbqt: outputPdbqt } });
        } else {
            throw e;
        }
    }
}
