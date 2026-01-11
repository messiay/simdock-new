import type { DockingResult, DockingPose } from '../core/types';
import type { DockingParams } from '../types';

// ============================================================================
// WEBINA BRIDGE - Ported from Source WebinaService.ts
// ============================================================================

const WASM_BASE = "/webina/"; // Location of vina.js in public/webina/

export interface WebinaCallbacks {
    onDone: (outTxt: string, stdOut: string, stdErr: string) => void;
    onError: (error: any) => void;
    onStdout?: (text: string) => void;
    onStderr?: (text: string) => void;
    onProgress?: (msg: string, percent: number) => void;
}

// Convert camelCase params to snake_case for Vina CLI
function convertParamsToVinaArgs(params: DockingParams): string[] {
    const args: string[] = [];

    // Helper to add arg
    const add = (flag: string, val: any) => {
        args.push(`--${flag}`);
        args.push(val.toString());
    };

    add('center_x', params.centerX);
    add('center_y', params.centerY);
    add('center_z', params.centerZ);
    add('size_x', params.sizeX);
    add('size_y', params.sizeY);
    add('size_z', params.sizeZ);
    add('exhaustiveness', params.exhaustiveness);
    add('num_modes', params.numModes || 9);
    add('energy_range', params.energyRange || 3);

    if (params.seed) {
        add('seed', params.seed);
    }

    // Force CPU to 1 to prevent worker crash 280032 (EAGAIN)
    // This seems to be a limitation of the current WASM build or environment
    // params.cpus passed from UI is ignored for stability
    add('cpu', 1);

    return args;
}

function parseVinaOutput(output: string, pdbqtOutput: string): DockingResult {
    const poses: DockingPose[] = [];
    const lines = output.split('\n');
    let inResultsTable = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('mode |   affinity')) {
            inResultsTable = true;
            continue;
        }

        if (inResultsTable && line.trim().match(/^\d+/)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
                const mode = parseInt(parts[0], 10);
                const affinity = parseFloat(parts[1]);
                const rmsdLB = parseFloat(parts[2]);
                const rmsdUB = parseFloat(parts[3]);

                if (!isNaN(mode) && !isNaN(affinity)) {
                    poses.push({
                        mode: mode,
                        affinity: affinity,
                        rmsdLB: isNaN(rmsdLB) ? 0 : rmsdLB,
                        rmsdUB: isNaN(rmsdUB) ? 0 : rmsdUB,
                        pdbqt: ''
                    });
                }
            }
        }

        if (inResultsTable && line.trim() === '') {
            inResultsTable = false;
        }
    }

    // Split PDBQT poses
    if (pdbqtOutput) {
        // Simple splitter based on MODEL/ENDMDL
        const models = pdbqtOutput.split("MODEL");
        // Skip pre-MODEL content (remarks)
        let poseIndex = 0;
        for (let i = 1; i < models.length; i++) {
            // Re-add MODEL tag
            const modelContent = "MODEL" + models[i];
            if (modelContent.includes("ENDMDL") && poseIndex < poses.length) {
                poses[poseIndex].pdbqt = modelContent;
                poseIndex++;
            }
        }
        // Fallback: if only one pose and no MODEL tags, or if parsing failed
        if (poses.length > 0 && poses[0].pdbqt === '') {
            poses[0].pdbqt = pdbqtOutput;
        }
    }

    return {
        poses,
        rawOutput: pdbqtOutput,
        logOutput: output
    };
}


export async function runWebinaVina(
    receptorPdbqt: string,
    ligandPdbqt: string,
    params: DockingParams,
    callbacks?: WebinaCallbacks
): Promise<DockingResult> {

    // Create the main execution promise
    const executionPromise = new Promise<DockingResult>(async (resolve, reject) => {
        let capturedStdout = '';
        let capturedStderr = '';
        let initializedObj: any = null;

        // Safety Timeout (45 seconds)
        const timeoutId = setTimeout(() => {
            const errorMsg = "Vina execution timed out after 45 seconds. This might be due to a worker crash or infinite loop.";
            console.error(errorMsg);
            if (callbacks?.onProgress) callbacks.onProgress(errorMsg, 0);
            reject(new Error(errorMsg));
        }, 45000);

        const log = (text: string) => {
            console.log(`[WebinaBridge] ${text}`);
            if (callbacks?.onStdout) callbacks.onStdout(text);
        };
        const err = (text: string) => {
            console.warn(`[WebinaBridge] ${text}`);
            // Also log stderr to stdout/diary for visibility
            if (callbacks?.onStderr) callbacks.onStderr(msg);
            // And to stdout callback too usually?
            if (callbacks?.onStdout) callbacks.onStdout(`ERROR: ${msg}`);
        };

        log("Starting Webina Vina...");

        // Perform SharedArrayBuffer check
        if (typeof SharedArrayBuffer === "undefined") {
            err("CRITICAL: SharedArrayBuffer is NOT available. Multithreading will fail.");
        } else {
            log("SharedArrayBuffer is available.");
        }

        try {
            // Dynamic Import of vina.js
            /* @vite-ignore */
            const mod = await import(`${WASM_BASE}vina.js?t=${Date.now()}`);
            const moduleFactory = mod.default;

            if (!moduleFactory) {
                throw new Error("vina.js default export not found");
            }

            callbacks?.onProgress?.("Initializing Engine...", 10);

            const webinaMod = await moduleFactory({
                logReadFiles: true,
                noInitialRun: true,
                // Preventing Pthread pool creation to avoid 280032 (EAGAIN)
                PTHREAD_POOL_SIZE: 0,
                PTHREAD_POOL_SIZE_STRICT: 0,
                locateFile: (path: string) => {
                    const cacheBuster = Date.now();
                    log(`locateFile: ${path}?t=${cacheBuster}`);
                    return `${WASM_BASE}${path}?t=${cacheBuster}`;
                },
                preRun: [
                    (This: any) => {
                        log("preRun: Writing input files to virtual FS");
                        try {
                            This.FS.writeFile("/receptor.pdbqt", receptorPdbqt);
                            This.FS.writeFile("/ligand.pdbqt", ligandPdbqt);
                            initializedObj = This;
                        } catch (e) {
                            err(`FS Write Error: ${e}`);
                        }
                    }
                ],
                print: (text: string) => {
                    log(text);
                    capturedStdout += text + "\n";

                    // Simple progress heuristics
                    if (text.includes('Computing Vina grid')) callbacks?.onProgress?.("Grid calculation...", 20);
                    if (text.includes('Performing docking')) callbacks?.onProgress?.("Docking...", 50);
                    if (text.includes('Refining results')) callbacks?.onProgress?.("Refining...", 90);
                },
                printErr: (text: string) => { // Line 201
                    err(text);
                    capturedStderr += text + "\n";
                },
                onExit: (_code: number) => {
                    clearTimeout(timeoutId); // Stop the timer
                    console.log("[WebinaBridge] Vina exited with code", _code);
                    if (_code !== 0) {
                        err(`Vina exited with error code ${_code}`);
                    }

                    let outTxt = "";
                    if (initializedObj) {
                        try {
                            outTxt = initializedObj.FS.readFile("/output.pdbqt", { encoding: "utf8" });
                            log(`Read output file: ${outTxt.length} bytes`);
                        } catch (e) {
                            err("Could not read /output.pdbqt (maybe no poses found?)");
                        }
                    }

                    const result = parseVinaOutput(capturedStdout, outTxt);
                    resolve(result);
                }
            });

            callbacks?.onProgress?.("Engine Ready. Starting Job...", 15);

            // Construct Args
            const args = convertParamsToVinaArgs(params);
            args.push('--receptor', '/receptor.pdbqt');
            args.push('--ligand', '/ligand.pdbqt');
            args.push('--out', '/output.pdbqt');

            log(`Running with args: ${args.join(' ')}`);

            // Execute
            try {
                webinaMod.callMain(args);
                // Note: callMain might be async or return immediately depending on build (Atomic vs not)
                // But Vina usually runs blocking on main thread IF pthreads not active, 
                // OR returns and runs in background if pthreads active?
                // Source WebinaService.ts didn't await callMain, but relied on callbacks? 
                // Actually Source Service just called callMain and didn't wait. 
                // BUT it relied on 'onExit'.

            } catch (e) {
                // Vina exit() throws a clean exception in some emscripten builds
                if ((e as any).name === "ExitStatus") {
                    // Handled in onExit
                } else {
                    throw e;
                }
            }

        } catch (e) {
            err(`Critical Error: ${e}`);
            reject(e);
        }
    });
}
