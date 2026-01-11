// ============================================================================
// VINA WASM DOCKING WORKER (Using Webina from DurrantLab)
// Uses REAL AutoDock Vina WASM binary via Webina library
// NO SYNTHETIC OR SIMULATED DATA - ALL REAL COMPUTATIONS
// ============================================================================

var CLI = null;

// Logging utility with verification prefix
function logVerify(stage, message, data) {
    var timestamp = new Date().toISOString();
    console.log('[VINA_VERIFY][' + timestamp + '][' + stage + '] ' + message);
    if (data !== undefined) {
        console.log('[VINA_VERIFY][' + stage + '] Data:', data);
    }
}

// Post progress message to main thread
function postProgress(message, progress) {
    logVerify('PROGRESS', progress + '% - ' + message);
    self.postMessage({
        type: 'progress',
        message: message,
        progress: progress
    });
}

// Post completion message to main thread
function postComplete(result) {
    logVerify('COMPLETE', 'Docking completed with ' + result.poses.length + ' poses');
    self.postMessage({
        type: 'complete',
        result: result
    });
}

// Post error message to main thread
function postError(message) {
    logVerify('ERROR', message);
    self.postMessage({
        type: 'error',
        message: message
    });
}

// Parse Vina output to extract binding affinities and poses
function parseVinaOutput(output, pdbqtOutput) {
    var poses = [];
    var lines = output.split('\n');
    var inResultsTable = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        // Look for results header
        if (line.includes('mode |   affinity')) {
            inResultsTable = true;
            continue;
        }

        // Parse result lines
        if (inResultsTable && line.trim().match(/^\d+/)) {
            var parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
                var mode = parseInt(parts[0], 10);
                var affinity = parseFloat(parts[1]);
                var rmsdLB = parseFloat(parts[2]);
                var rmsdUB = parseFloat(parts[3]);

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

        // End of results table
        if (inResultsTable && line.trim() === '') {
            inResultsTable = false;
        }
    }

    // Parse PDBQT output to extract individual poses
    var poseContents = splitPdbqtPoses(pdbqtOutput);
    for (var j = 0; j < poses.length && j < poseContents.length; j++) {
        poses[j].pdbqt = poseContents[j];
    }

    return {
        poses: poses,
        rawOutput: pdbqtOutput,
        logOutput: output
    };
}

// Split PDBQT output file into individual poses
function splitPdbqtPoses(pdbqtContent) {
    var poses = [];
    var lines = pdbqtContent.split('\n');
    var currentPose = [];
    var insideModel = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.startsWith('MODEL')) {
            if (currentPose.length > 0 && !insideModel) {
                poses.push(currentPose.join('\n'));
                currentPose = [];
            }
            insideModel = true;
            currentPose.push(line);
        } else if (line.startsWith('ENDMDL')) {
            currentPose.push(line);
            poses.push(currentPose.join('\n'));
            currentPose = [];
            insideModel = false;
        } else {
            if (insideModel) {
                currentPose.push(line);
            }
        }
    }

    if (poses.length === 0 && pdbqtContent.trim()) {
        poses.push(pdbqtContent);
    }

    return poses;
}

// Initialize Webina
var webinaLoaded = false;
async function initializeWebina() {
    if (webinaLoaded) {
        logVerify('INIT', 'Webina already loaded, reusing');
        return;
    }

    logVerify('INIT', 'Starting Webina initialization...');
    postProgress('Loading Webina (AutoDock Vina WASM)...', 5);

    try {
        // Load Webina library using importScripts (classic worker allows this)
        logVerify('INIT', 'Loading Webina.min.js via importScripts');
        importScripts('/webina/webina/Webina/Webina.min.js');

        if (typeof Webina === 'undefined') {
            throw new Error('Webina failed to load - global not found after importScripts');
        }

        logVerify('INIT', 'Webina global loaded successfully');
        webinaLoaded = true;
        postProgress('Webina loaded', 15);
    } catch (error) {
        logVerify('INIT_ERROR', 'Webina initialization failed', error);
        console.error('Webina Initialization Failed:', error);

        var errMsg = 'Unknown error';
        if (error instanceof Error) errMsg = error.message;
        else if (typeof error === 'string') errMsg = error;
        else errMsg = JSON.stringify(error);

        throw new Error('Failed to initialize Webina: ' + errMsg);
    }
}

// Run docking (REAL WASM EXECUTION - NO SIMULATION)
async function runDocking(request) {
    logVerify('START', '========== DOCKING JOB STARTED ==========');
    logVerify('START', 'This is REAL WASM execution via Webina, not simulated');

    // Check SharedArrayBuffer requirements
    if (typeof SharedArrayBuffer === 'undefined') {
        logVerify('PREREQ', 'CRITICAL: SharedArrayBuffer is not available!');
        console.error('[Worker] SharedArrayBuffer is missing! COOP/COEP headers likely required.');
        postError('Browser Error: SharedArrayBuffer is not enabled. Is the server sending COOP/COEP headers?');
        return;
    }
    logVerify('PREREQ', 'SharedArrayBuffer is available ✓');

    var receptorPdbqt = request.receptorPdbqt;
    var ligandPdbqt = request.ligandPdbqt;
    var params = request.params;

    // ========== INPUT VALIDATION ==========
    logVerify('INPUT', '---------- INPUT VALIDATION ----------');
    logVerify('INPUT', 'Receptor PDBQT size: ' + receptorPdbqt.length + ' characters');
    logVerify('INPUT', 'Ligand PDBQT size: ' + ligandPdbqt.length + ' characters');
    logVerify('INPUT', 'Receptor first 200 chars: ' + receptorPdbqt.substring(0, 200));
    logVerify('INPUT', 'Ligand first 200 chars: ' + ligandPdbqt.substring(0, 200));

    var receptorHasAtoms = receptorPdbqt.includes('ATOM') || receptorPdbqt.includes('HETATM');
    logVerify('INPUT', 'Receptor contains ATOM/HETATM records: ' + receptorHasAtoms);

    var ligandHasRoot = ligandPdbqt.includes('ROOT');
    var ligandHasBranch = ligandPdbqt.includes('BRANCH');
    var ligandHasAtoms = ligandPdbqt.includes('ATOM') || ligandPdbqt.includes('HETATM');
    logVerify('INPUT', 'Ligand has ROOT: ' + ligandHasRoot + ', BRANCH: ' + ligandHasBranch + ', ATOMS: ' + ligandHasAtoms);

    // Log docking parameters
    logVerify('PARAMS', '---------- DOCKING PARAMETERS ----------');
    logVerify('PARAMS', 'Center: (' + params.centerX + ', ' + params.centerY + ', ' + params.centerZ + ')');
    logVerify('PARAMS', 'Size: (' + params.sizeX + ', ' + params.sizeY + ', ' + params.sizeZ + ')');
    logVerify('PARAMS', 'Exhaustiveness: ' + params.exhaustiveness);
    logVerify('PARAMS', 'Num Modes: ' + (params.numModes || 9));

    try {
        await initializeWebina();

        // Build Webina-compatible params object
        var vinaParams = {
            center_x: params.centerX,
            center_y: params.centerY,
            center_z: params.centerZ,
            size_x: params.sizeX,
            size_y: params.sizeY,
            size_z: params.sizeZ,
            exhaustiveness: params.exhaustiveness,
            num_modes: params.numModes || 9
        };

        logVerify('EXEC', '---------- EXECUTING VINA WASM ----------');
        postProgress('Running AutoDock Vina (REAL WASM computation)...', 30);

        var startTime = performance.now();

        // Run Webina - it returns a Promise
        Webina.start(
            vinaParams,
            receptorPdbqt,
            ligandPdbqt,
            function (outPDBQT, stdOut, stdErr) {
                // Success callback
                var endTime = performance.now();
                logVerify('EXEC', 'Vina execution completed in ' + (endTime - startTime).toFixed(2) + 'ms');

                // ========== OUTPUT CAPTURE ==========
                logVerify('OUTPUT', '---------- VINA OUTPUT ----------');
                logVerify('OUTPUT', 'stdout length: ' + (stdOut ? stdOut.length : 0) + ' chars');
                logVerify('OUTPUT', 'stderr length: ' + (stdErr ? stdErr.length : 0) + ' chars');
                logVerify('OUTPUT', 'output PDBQT length: ' + (outPDBQT ? outPDBQT.length : 0) + ' chars');
                logVerify('OUTPUT', 'STDOUT CONTENT:');
                console.log(stdOut);
                if (stdErr && stdErr.length > 0) {
                    logVerify('OUTPUT', 'STDERR CONTENT:');
                    console.log(stdErr);
                }

                var hasResultsTable = stdOut && stdOut.includes('mode |   affinity');
                logVerify('OUTPUT', 'Contains results table (mode | affinity): ' + hasResultsTable);

                postProgress('Processing results...', 90);

                // ========== READ OUTPUT ==========
                logVerify('READ', '---------- ANALYZING OUTPUT ----------');
                logVerify('READ', 'Output PDBQT first 500 chars: ' + outPDBQT.substring(0, 500));

                var hasVinaResult = outPDBQT.includes('REMARK VINA RESULT');
                var hasModels = outPDBQT.includes('MODEL');
                logVerify('READ', 'Output has REMARK VINA RESULT: ' + hasVinaResult);
                logVerify('READ', 'Output has MODEL sections: ' + hasModels);

                // ========== PARSE RESULTS ==========
                logVerify('PARSE', '---------- PARSING RESULTS ----------');
                var result = parseVinaOutput(stdOut, outPDBQT);
                logVerify('PARSE', 'Parsed ' + result.poses.length + ' binding poses');

                if (result.poses.length > 0) {
                    logVerify('PARSE', 'Binding affinities:');
                    result.poses.forEach(function (pose, idx) {
                        logVerify('PARSE', '  Mode ' + pose.mode + ': ' + pose.affinity + ' kcal/mol (RMSD: ' + pose.rmsdLB + '/' + pose.rmsdUB + ')');
                    });
                    logVerify('PARSE', 'Best affinity: ' + result.poses[0].affinity + ' kcal/mol');
                }

                // ========== COMPLETE ==========
                logVerify('DONE', '========== DOCKING JOB COMPLETED ==========');
                logVerify('DONE', 'This was REAL Vina WASM computation via Webina, not simulated!');

                postProgress('Docking complete!', 100);
                postComplete(result);
            },
            function (error) {
                // Error callback
                logVerify('ERROR', '========== WEBINA ERROR ==========');
                logVerify('ERROR', 'Error: ' + error);
                postError('Webina execution failed: ' + error);
            },
            // Path to Webina files
            '/webina/webina/Webina/'
        );

    } catch (error) {
        logVerify('ERROR', '========== DOCKING ERROR ==========');
        logVerify('ERROR', 'Error: ' + (error instanceof Error ? error.message : String(error)));
        console.error('Docking Error:', error);
        postError('Docking execution failed: ' + (error instanceof Error ? error.message : String(error)));
    }
}

// Handle messages from main thread
self.onmessage = async function (event) {
    var request = event.data;
    logVerify('MESSAGE', 'Received message type: ' + request.type);

    if (request.type === 'dock') {
        await runDocking(request);
    }
};
