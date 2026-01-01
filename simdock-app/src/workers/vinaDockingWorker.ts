// Dedicated Web Worker for Vina Docking
// Prevents UI freezing and handles Emscripten quirks

// ============================================
// THE CRITICAL HACK: Prevent nested workers
// ============================================
// Emscripten checks `typeof Worker !== 'undefined'`
// Deleting these forces it to use single-threaded fallback
delete (self as any).Worker;
delete (self as any).SharedArrayBuffer;
delete (self as any).Atomics;

// Timeout for docking calculations (60 seconds)
const DOCKING_TIMEOUT_MS = 60000;

self.onmessage = async (e: MessageEvent) => {
    const {
        receptor,
        ligand,
        params,
        baseUrl = '/vina'
    } = e.data;

    try {
        console.log('[DockingWorker] Received job. Loading Vina...');
        postMessage({ type: 'log', message: 'Initializing Vina WASM...' });

        // 1. Load Vina Classic (more compatible build)
        const vinaUrl = `${globalThis.location.origin}${baseUrl}/vina.classic.js?v=${Date.now()}`;
        const moduleImport = await import(/* @vite-ignore */ vinaUrl);
        const VinaFactory = moduleImport.default;

        // Promise to handle async Vina completion
        let completionResolve: (exitCode: number) => void;
        let completionReject: (reason: any) => void;
        const completionPromise = new Promise<number>((resolve, reject) => {
            completionResolve = resolve;
            completionReject = reject;
        });

        const outputFile = '/output.pdbqt';

        // 2. Initialize Vina with robust configuration
        const config = {
            logReadFiles: true,
            noInitialRun: true,
            locateFile: (path: string) => `${baseUrl}/${path}`,
            mainScriptUrlOrBlob: vinaUrl,

            // Threading is already disabled via delete above,
            // but this acts as defense-in-depth
            pthreadPoolSize: 0,

            print: (text: string) => {
                console.log(`[Vina] ${text}`);
                postMessage({ type: 'log', message: text });
            },
            printErr: (text: string) => {
                console.warn(`[Vina ERR] ${text}`);
                postMessage({ type: 'log', message: `[STDERR] ${text}` });
            },
            onExit: (code: number) => {
                console.log(`[DockingWorker] Vina onExit: ${code}`);
                // Small delay to ensure FS writes are flushed
                setTimeout(() => completionResolve(code), 50);
            },
            quit: (code: number, toThrow: any) => {
                console.log(`[DockingWorker] Vina quit: ${code}`);
                // Don't reject here, let onExit handle it
                throw toThrow;
            }
        };

        const vinaMod = await VinaFactory(config);

        // Ensure ready
        if (vinaMod.ready) await vinaMod.ready;

        console.log('[DockingWorker] Vina Ready. Writing files...');
        postMessage({ type: 'log', message: 'Writing input files to virtual filesystem...' });

        // 3. Write Files to Virtual FS
        try {
            vinaMod.FS.writeFile('/receptor.pdbqt', receptor);
            vinaMod.FS.writeFile('/ligand.pdbqt', ligand);
            const rStat = vinaMod.FS.stat('/receptor.pdbqt');
            const lStat = vinaMod.FS.stat('/ligand.pdbqt');
            postMessage({ type: 'log', message: `Files written. Receptor: ${rStat.size}b, Ligand: ${lStat.size}b` });
        } catch (err: any) {
            throw new Error(`Failed to write input files: ${err.message}`);
        }

        // 4. Construct Arguments
        const args = [
            '--receptor', '/receptor.pdbqt',
            '--ligand', '/ligand.pdbqt',
            '--center_x', String(params.center_x),
            '--center_y', String(params.center_y),
            '--center_z', String(params.center_z),
            '--size_x', String(params.size_x),
            '--size_y', String(params.size_y),
            '--size_z', String(params.size_z),
            '--exhaustiveness', String(params.exhaustiveness || 8),
            '--num_modes', String(params.num_modes || 9),
            '--cpu', '1', // Force single-threaded inside worker
            '--out', outputFile
        ];

        if (params.seed) {
            args.push('--seed', String(params.seed));
        }

        // 5. Run Docking with Timeout
        postMessage({ type: 'log', message: 'Starting Vina execution...' });
        const startTime = performance.now();
        console.log('[DockingWorker] Calling main with:', args);

        // Setup timeout
        const timeoutId = setTimeout(() => {
            completionReject(new Error(`Vina calculation timeout after ${DOCKING_TIMEOUT_MS / 1000}s`));
        }, DOCKING_TIMEOUT_MS);

        try {
            vinaMod.callMain(args);
        } catch (e: any) {
            // Emscripten often throws ExitStatus on normal exit
            if (e instanceof vinaMod.ExitStatus || e.name === 'ExitStatus') {
                console.log('[DockingWorker] Caught ExitStatus:', e.status);
            } else if (e.message && e.message.includes('unwind')) {
                // Ignore "unwind" pseudo-exceptions
            } else {
                console.error("[DockingWorker] Vina Exception:", e);
                clearTimeout(timeoutId);
                throw e;
            }
        }

        // Wait for completion (via onExit callback)
        const exitCode = await completionPromise;
        clearTimeout(timeoutId);

        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`[DockingWorker] Execution complete. Exit: ${exitCode}. Duration: ${duration.toFixed(2)}s`);
        postMessage({ type: 'log', message: `Vina finished (Exit ${exitCode}) in ${duration.toFixed(1)}s` });

        // 6. Read Output with verification
        let outputPdbqt = '';
        if (exitCode === 0) {
            try {
                // Verify file exists
                const outStat = vinaMod.FS.stat(outputFile);
                if (outStat.size === 0) {
                    throw new Error('Output file is empty');
                }

                outputPdbqt = vinaMod.FS.readFile(outputFile, { encoding: 'utf8' });
                postMessage({ type: 'log', message: `Output read: ${outStat.size} bytes` });

                // 7. Cleanup virtual FS
                try {
                    vinaMod.FS.unlink('/receptor.pdbqt');
                    vinaMod.FS.unlink('/ligand.pdbqt');
                    vinaMod.FS.unlink(outputFile);
                } catch (cleanupErr) {
                    console.warn('[DockingWorker] Cleanup warning:', cleanupErr);
                }

            } catch (e: any) {
                throw new Error(`Docking finished (Exit 0) but output file error: ${e.message}`);
            }
        } else {
            throw new Error(`Vina exited with error code ${exitCode}. Check console for stderr.`);
        }

        // 8. Send Results
        postMessage({
            type: 'complete',
            output: outputPdbqt,
            duration
        });

    } catch (error: any) {
        console.error('[DockingWorker] Error:', error);
        postMessage({
            type: 'error',
            error: error.message || String(error)
        });
    }
};
