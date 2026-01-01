// Dedicated Web Worker for Vina Docking
// Handles docking in a separate thread to prevent UI freezing
// Uses onExit callback and forces single-threaded execution to avoid nested worker crashes

self.onmessage = async (e: MessageEvent) => {
    const {
        receptor,
        ligand,
        params,
        baseUrl = '/vina'
    } = e.data;

    try {
        console.log('[DockingWorker] Received job. Loading Vina Classic...');

        // 1. Load Vina Classic (Attempting to use the potentially more compatible build)
        const vinaUrl = `${globalThis.location.origin}${baseUrl}/vina.classic.js?v=${Date.now()}`;
        const moduleImport = await import(/* @vite-ignore */ vinaUrl);
        const VinaFactory = moduleImport.default;

        // Promise to handle async Vina completion
        let completionResolve: () => void;
        let completionReject: (reason: any) => void;
        const completionPromise = new Promise<void>((resolve, reject) => {
            completionResolve = resolve;
            completionReject = reject;
        });

        let exitCode = 0;

        // 2. Initialize Vina
        const config = {
            logReadFiles: true,
            noInitialRun: true,
            locateFile: (path: string) => `${baseUrl}/${path}`,
            mainScriptUrlOrBlob: vinaUrl,

            // ATTEMPT TO DISABLE THREAD POOL SPAWNING
            pthreadPoolSize: 0,

            print: (text: string) => {
                console.log(`[Vina STDOUT] ${text}`);
                postMessage({ type: 'log', message: text });
            },
            printErr: (text: string) => {
                console.warn(`[Vina STDERR] ${text}`);
                // Filter out the specific worker error if it's non-fatal, but usually it is fatal
                postMessage({ type: 'log', message: `[STDERR] ${text}` });
            },
            onExit: (code: number) => {
                console.log(`[DockingWorker] Vina onExit called with code: ${code}`);
                exitCode = code;
                completionResolve();
            },
            quit: (code: number, toThrow: any) => {
                console.log(`[DockingWorker] Vina quit called: ${code}`);
                exitCode = code;
                throw toThrow;
            }
        };

        // Hack: Mask Worker to force Vina to run on this thread if pthreadPoolSize doesn't work
        (self as any).Worker = undefined; // UPDATED: Force Single Threaded Execution

        const vinaMod = await VinaFactory(config);

        // Ensure ready
        if (vinaMod.ready) await vinaMod.ready;

        console.log('[DockingWorker] Vina Ready. Writing files...');

        // 3. Write Files
        try {
            vinaMod.FS.writeFile('receptor.pdbqt', receptor);
            vinaMod.FS.writeFile('ligand.pdbqt', ligand);
            const rStat = vinaMod.FS.stat('receptor.pdbqt');
            postMessage({ type: 'log', message: `Files written. Receptor: ${rStat.size}b` });
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
            '--cpu', '1',
            '--out', '/output.pdbqt'
        ];

        if (params.seed) {
            args.push('--seed', String(params.seed));
        }

        // 5. Run Docking
        postMessage({ type: 'log', message: 'Starting Vina execution...' });
        const startTime = performance.now();
        console.log('[DockingWorker] Calling main with:', args);

        try {
            vinaMod.callMain(args);
        } catch (e: any) {
            if (e instanceof vinaMod.ExitStatus || e.name === 'ExitStatus') {
                console.log('[DockingWorker] Caught ExitStatus:', e.status);
            } else if (e.message && e.message.includes('unwind')) {
                // ignore
            } else {
                console.error("[DockingWorker] Vina Exception:", e);
            }
        }

        await completionPromise;

        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`[DockingWorker] Execution complete. Exit Code: ${exitCode}. Duration: ${duration.toFixed(2)}s`);
        postMessage({ type: 'log', message: `Execution finished with Exit Code: ${exitCode}` });

        // 6. Read Output
        let outputPdbqt = '';
        if (exitCode === 0) {
            try {
                outputPdbqt = vinaMod.FS.readFile('/output.pdbqt', { encoding: 'utf8' });
            } catch (e) {
                throw new Error(`Docking finished (Exit 0) but output file not found. Check Console.`);
            }
        } else {
            throw new Error(`Vina exited with error code ${exitCode}. Check console for stderr.`);
        }

        // 7. Send Results
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
