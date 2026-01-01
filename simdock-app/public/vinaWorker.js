/**
 * Vina Docking Worker
 * Runs AutoDock Vina WASM in a Web Worker for non-blocking UI
 * 
 * Message Protocol:
 * IN:  { type: 'START', receptor: string, ligand: string, config: GridConfig }
 * OUT: { type: 'LOG', message: string }
 * OUT: { type: 'PROGRESS', percent: number }
 * OUT: { type: 'COMPLETE', results: DockingResult[], output: string }
 * OUT: { type: 'ERROR', error: string }
 */

// Import the WASM module
importScripts('/vina.js');

let isRunning = false;

// Listen for messages from main thread
self.onmessage = async function (e) {
    const { type, receptor, ligand, config } = e.data;

    if (type === 'START') {
        if (isRunning) {
            self.postMessage({ type: 'ERROR', error: 'Docking already in progress' });
            return;
        }

        isRunning = true;
        await runDocking(receptor, ligand, config);
        isRunning = false;
    }
};

async function runDocking(receptorPdbqt, ligandPdbqt, config) {
    const logs = [];
    let moduleInstance = null;

    const log = (msg) => {
        logs.push(msg);
        self.postMessage({ type: 'LOG', message: msg });
    };

    log('[Worker] Starting Vina WASM docking...');
    log(`[Worker] Receptor: ${receptorPdbqt.split('\n').length} lines`);
    log(`[Worker] Ligand: ${ligandPdbqt.split('\n').length} lines`);
    log(`[Worker] Grid: center(${config.centerX}, ${config.centerY}, ${config.centerZ}) size(${config.sizeX}, ${config.sizeY}, ${config.sizeZ})`);
    log(`[Worker] Exhaustiveness: ${config.exhaustiveness}`);

    self.postMessage({ type: 'PROGRESS', percent: 10 });

    try {
        const moduleConfig = {
            noInitialRun: true,
            locateFile: (path) => `/${path}`,
            preRun: [(instance) => {
                instance.FS.writeFile('/receptor.pdbqt', receptorPdbqt);
                instance.FS.writeFile('/ligand.pdbqt', ligandPdbqt);
                moduleInstance = instance;
                log('[Worker] Input files written to virtual FS');
            }],
            print: (text) => {
                log(`[Vina] ${text}`);
            },
            printErr: (text) => {
                if (text.includes('VINA RESULT') || text.includes('mode') || text.includes('affinity')) {
                    log(`[Vina] ${text}`);
                } else if (!text.includes('warning')) {
                    log(`[Vina] ${text}`);
                }
            }
        };

        self.postMessage({ type: 'PROGRESS', percent: 20 });

        // Initialize WASM module 
        const mod = await WEBINA_MODULE(moduleConfig);
        moduleInstance = mod;

        log('[Worker] WASM module initialized, starting docking...');
        self.postMessage({ type: 'PROGRESS', percent: 30 });

        // Build command line arguments
        const args = [
            '--receptor', '/receptor.pdbqt',
            '--ligand', '/ligand.pdbqt',
            '--center_x', String(config.centerX),
            '--center_y', String(config.centerY),
            '--center_z', String(config.centerZ),
            '--size_x', String(config.sizeX),
            '--size_y', String(config.sizeY),
            '--size_z', String(config.sizeZ),
            '--exhaustiveness', String(config.exhaustiveness),
            '--num_modes', String(config.numModes || 9),
            '--out', '/output.pdbqt'
        ];

        log(`[Worker] Args: ${args.join(' ')}`);

        // Run Vina
        const startTime = performance.now();
        mod.callMain(args);
        const endTime = performance.now();
        const dockingTime = ((endTime - startTime) / 1000).toFixed(2);

        log(`[Worker] Docking completed in ${dockingTime} seconds`);
        self.postMessage({ type: 'PROGRESS', percent: 90 });

        // Read output
        const outputPdbqt = mod.FS.readFile('/output.pdbqt', { encoding: 'utf8' });

        // Parse results
        const results = parseVinaOutput(outputPdbqt);
        log(`[Worker] Found ${results.length} binding poses`);

        if (results.length > 0) {
            log(`[Worker] Best score: ${results[0].score} kcal/mol`);
        }

        self.postMessage({ type: 'PROGRESS', percent: 100 });
        self.postMessage({
            type: 'COMPLETE',
            results: results,
            output: outputPdbqt,
            dockingTime: parseFloat(dockingTime)
        });

    } catch (error) {
        log(`[Worker] Error: ${error.message}`);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
}

function parseVinaOutput(pdbqtContent) {
    const results = [];
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
