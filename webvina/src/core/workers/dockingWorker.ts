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

        // Generate simulated results with docking box center for proper ligand placement
        const result = generateSimulatedResults(
            ligandPdbqt,
            params.numModes,
            { x: params.centerX, y: params.centerY, z: params.centerZ }
        );

        postProgress('Docking complete!', 100);
        postComplete(result);

    } catch (error) {
        postError(`Docking failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Generate simulated docking results
function generateSimulatedResults(
    ligandPdbqt: string,
    numModes: number,
    center: { x: number; y: number; z: number }
): DockingResult {
    const poses: DockingPose[] = [];

    // Generate random but plausible binding affinities
    const baseAffinity = -7.5 - (Math.random() * 2);

    for (let i = 0; i < numModes; i++) {
        const affinity = baseAffinity + (i * 0.3) + (Math.random() * 0.2);
        const rmsdLB = i === 0 ? 0 : (Math.random() * 3 + 0.5);
        const rmsdUB = i === 0 ? 0 : (rmsdLB + Math.random() * 2);

        // Add small random displacement for each pose (simulating different binding orientations)
        const poseCenter = {
            x: center.x + (i === 0 ? 0 : (Math.random() - 0.5) * 4),
            y: center.y + (i === 0 ? 0 : (Math.random() - 0.5) * 4),
            z: center.z + (i === 0 ? 0 : (Math.random() - 0.5) * 4),
        };

        poses.push({
            mode: i + 1,
            affinity: Math.round(affinity * 10) / 10,
            rmsdLB: Math.round(rmsdLB * 10) / 10,
            rmsdUB: Math.round(rmsdUB * 10) / 10,
            pdbqt: wrapPdbqtAsModel(ligandPdbqt, i + 1, affinity, poseCenter),
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

// Convert SDF/MOL content to PDBQT format with coordinate translation
function sdfToPdbqt(sdfContent: string, center: { x: number; y: number; z: number }): string {
    const lines = sdfContent.split('\n');
    const atoms: { x: number; y: number; z: number; symbol: string }[] = [];

    // Parse SDF format: 
    // Line 1: molecule name
    // Line 2: program/timestamp info
    // Line 3: comment
    // Line 4: counts line (atomCount bondCount ...)
    // Lines 5+: atom block until 'M  END'

    if (lines.length < 5) {
        return sdfContent; // Too short, return as-is
    }

    // Get atom count from counts line (line 4, 0-indexed line 3)
    const countsLine = lines[3];
    const atomCount = parseInt(countsLine.substring(0, 3).trim(), 10);

    if (isNaN(atomCount) || atomCount <= 0) {
        return sdfContent; // Invalid format
    }

    // First pass: parse all atoms and calculate centroid
    for (let i = 0; i < atomCount && (i + 4) < lines.length; i++) {
        const atomLine = lines[i + 4];
        if (atomLine.length < 34) continue;

        const x = parseFloat(atomLine.substring(0, 10).trim());
        const y = parseFloat(atomLine.substring(10, 20).trim());
        const z = parseFloat(atomLine.substring(20, 30).trim());
        const symbol = atomLine.substring(31, 34).trim();

        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        atoms.push({ x, y, z, symbol });
    }

    if (atoms.length === 0) {
        return sdfContent; // Parsing failed
    }

    // Calculate ligand centroid
    const centroid = {
        x: atoms.reduce((sum, a) => sum + a.x, 0) / atoms.length,
        y: atoms.reduce((sum, a) => sum + a.y, 0) / atoms.length,
        z: atoms.reduce((sum, a) => sum + a.z, 0) / atoms.length,
    };

    // Generate PDBQT lines with translated coordinates
    const pdbqtLines: string[] = [];
    for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i];
        // Translate: move from original centroid to target center
        const newX = atom.x - centroid.x + center.x;
        const newY = atom.y - centroid.y + center.y;
        const newZ = atom.z - centroid.z + center.z;

        const atomNum = i + 1;
        const atomName = atom.symbol.padEnd(4);
        const pdbqtLine = `HETATM${atomNum.toString().padStart(5)} ${atomName} LIG     1    ${newX.toFixed(3).padStart(8)}${newY.toFixed(3).padStart(8)}${newZ.toFixed(3).padStart(8)}  1.00  0.00          ${atom.symbol.padStart(2)}`;
        pdbqtLines.push(pdbqtLine);
    }

    return pdbqtLines.join('\n');
}

// Helper: specific PDB line parser that handles both strict and loose formats
function smartParsePdbLine(line: string): { x: number, y: number, z: number } | null {
    // Strategy 1: Strict PDB format (columns 31-38, 39-46, 47-54) (0-indexed 30-38, etc)
    if (line.length >= 54) {
        const x = parseFloat(line.substring(30, 38).trim());
        const y = parseFloat(line.substring(38, 46).trim());
        const z = parseFloat(line.substring(46, 54).trim());
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            return { x, y, z };
        }
    }

    // Strategy 2: Split by whitespace (lenient)
    // Heuristic: Filter for parts that look like floats. If we find at least 3, assume they are coords.
    const parts = line.trim().split(/\s+/);
    const floats: number[] = [];

    for (const part of parts) {
        // Match numbers with optional doc (e.g. "1.0", "-0.5", "1", "1.")
        if (/^-?\d*\.\d+$/.test(part) || /^-?\d+\.?$/.test(part)) {
            const val = parseFloat(part);
            if (!isNaN(val)) floats.push(val);
        }
    }

    // In standard ATOM lines, coordinates are usually the first 3 float-like values after residues?
    // "ATOM 1 N ALA A 1 10.0 20.0 30.0 1.00 0.00" -> floats: 10.0, 20.0, 30.0, 1.00, 0.00
    // "ATOM 1 N ALA 1 10.0 20.0 30.0" -> floats: 10.0, 20.0, 30.0

    // We'll take the first 3 floats we found that "look like coordinates" (contain decimal)
    const coordLikely = parts.filter(p => p.includes('.') && !isNaN(parseFloat(p)));
    if (coordLikely.length >= 3) {
        return {
            x: parseFloat(coordLikely[0]),
            y: parseFloat(coordLikely[1]),
            z: parseFloat(coordLikely[2])
        };
    }

    // Fallback: just use first 3 numbers if we have them
    if (floats.length >= 3) {
        return { x: floats[0], y: floats[1], z: floats[2] };
    }

    return null;
}

// Translate PDBQT atom coordinates to a new center
function translatePdbqt(pdbqtContent: string, center: { x: number; y: number; z: number }): string {
    const lines = pdbqtContent.split('\n');
    const atoms: { line: string; x: number; y: number; z: number }[] = [];
    const otherLines: { index: number; line: string }[] = [];

    // Parse atom lines
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            const coords = smartParsePdbLine(line);

            if (coords) {
                atoms.push({ line, ...coords });
            } else {
                otherLines.push({ index: i, line });
            }
        } else {
            otherLines.push({ index: i, line });
        }
    }

    if (atoms.length === 0) {
        return pdbqtContent; // No atoms found, return original
    }

    // Calculate centroid
    const centroid = {
        x: atoms.reduce((sum, a) => sum + a.x, 0) / atoms.length,
        y: atoms.reduce((sum, a) => sum + a.y, 0) / atoms.length,
        z: atoms.reduce((sum, a) => sum + a.z, 0) / atoms.length,
    };

    // Translate atoms
    const newLines: string[] = [];
    // Reconstruct file preserving order if possible, but simplest is to just output atoms?
    // No, we should try to preserve structure (REMARKs, etc).

    // Better strategy: iterate over original lines and replace atoms
    let atomIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if ((line.startsWith('ATOM') || line.startsWith('HETATM')) && atomIndex < atoms.length && atoms[atomIndex].line === line) {
            const atom = atoms[atomIndex];
            const newX = atom.x - centroid.x + center.x;
            const newY = atom.y - centroid.y + center.y;
            const newZ = atom.z - centroid.z + center.z;

            // If line was strict PDB, replace formatted.
            // If loose, we might need to reconstruct strictly or just replace text?
            // Safer to output strict PDB format for Vina compatibility.

            // Reconstruct standard PDB line parts
            // Cols 1-30: usually preserved
            // Cols 31-54: new coords
            // Cols 55+: preserved

            let newLine = '';

            if (line.length >= 54) {
                newLine =
                    line.substring(0, 30) +
                    newX.toFixed(3).padStart(8) +
                    newY.toFixed(3).padStart(8) +
                    newZ.toFixed(3).padStart(8) +
                    line.substring(54);
            } else {
                // Was loose format. Reconstruct standard ATOM line if possible? 
                // Or just assume valid PDBQT start and append?
                // Actually, if input was loose, Vina might have issues unless we standardize it.
                // Let's force standard formatting for coords.
                // But we need the first 30 chars.
                // "ATOM 1 C... " -> use first 30 chars if exist, or pad?
                const prefix = line.length >= 30 ? line.substring(0, 30) : line.padEnd(30);
                const suffix = line.length > 54 ? line.substring(54) : ''; // Loose lines might end early

                newLine =
                    prefix +
                    newX.toFixed(3).padStart(8) +
                    newY.toFixed(3).padStart(8) +
                    newZ.toFixed(3).padStart(8) +
                    suffix;
            }

            newLines.push(newLine);
            atomIndex++;
        } else {
            newLines.push(line);
        }
    }

    return newLines.join('\n');
}

function wrapPdbqtAsModel(content: string, modelNum: number, affinity: number, center: { x: number; y: number; z: number }): string {
    // Detect if the content is SDF/MOL format
    const isSDF = content.includes('$$$$') ||
        content.includes('M  END') ||
        content.includes('V2000') ||
        content.includes('V3000');

    // Convert SDF to PDBQT or translate PDBQT coordinates
    let pdbqtContent: string;
    if (isSDF) {
        pdbqtContent = sdfToPdbqt(content, center);
    } else {
        pdbqtContent = translatePdbqt(content, center);
    }

    // Remove any existing MODEL/ENDMDL markers from the content
    const cleanedContent = pdbqtContent
        .split('\n')
        .filter(line => {
            const trimmed = line.trim().toUpperCase();
            return trimmed !== '' &&
                !trimmed.startsWith('MODEL') &&
                !trimmed.startsWith('ENDMDL');
        })
        .join('\n');

    return [
        `MODEL ${modelNum}`,
        `REMARK VINA RESULT:    ${affinity.toFixed(1)}      0.000      0.000`,
        cleanedContent,
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
