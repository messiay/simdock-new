/**
 * Gridbox Calculator
 * Auto-detect optimal docking grid based on molecule coordinates
 */

import { type Gridbox } from '../db';

interface Coordinate {
    x: number;
    y: number;
    z: number;
}

/**
 * Calculate gridbox centered on ligand with padding
 */
export function calculateGridboxFromCoords(
    coords: Coordinate[],
    padding = 10
): Gridbox {
    if (coords.length === 0) {
        // Default grid if no coords
        return {
            centerX: 0,
            centerY: 0,
            centerZ: 0,
            sizeX: 20,
            sizeY: 20,
            sizeZ: 20
        };
    }

    // Find bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const c of coords) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
        minZ = Math.min(minZ, c.z);
        maxZ = Math.max(maxZ, c.z);
    }

    // Calculate center (midpoint of bounding box)
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Calculate size (extent + padding on each side)
    const sizeX = Math.max(20, (maxX - minX) + padding * 2);
    const sizeY = Math.max(20, (maxY - minY) + padding * 2);
    const sizeZ = Math.max(20, (maxZ - minZ) + padding * 2);

    return {
        centerX: Math.round(centerX * 100) / 100,
        centerY: Math.round(centerY * 100) / 100,
        centerZ: Math.round(centerZ * 100) / 100,
        sizeX: Math.round(sizeX),
        sizeY: Math.round(sizeY),
        sizeZ: Math.round(sizeZ)
    };
}

/**
 * Parse PDBQT and calculate gridbox
 */
export function calculateGridboxFromPDBQT(pdbqtContent: string, padding = 10): Gridbox {
    const coords: Coordinate[] = [];
    const lines = pdbqtContent.split('\n');

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            const x = parseFloat(line.substring(30, 38));
            const y = parseFloat(line.substring(38, 46));
            const z = parseFloat(line.substring(46, 54));

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                coords.push({ x, y, z });
            }
        }
    }

    return calculateGridboxFromCoords(coords, padding);
}

/**
 * Parse SDF and calculate gridbox
 */
export function calculateGridboxFromSDF(sdfContent: string, padding = 10): Gridbox {
    const coords: Coordinate[] = [];
    const lines = sdfContent.split('\n');

    // Find atom count in counts line
    let atomCount = 0;
    let startLine = 0;

    for (let i = 3; i < Math.min(10, lines.length); i++) {
        const match = lines[i].match(/^\s*(\d+)\s+(\d+)/);
        if (match) {
            atomCount = parseInt(match[1]);
            startLine = i + 1;
            break;
        }
    }

    // Parse atom coordinates
    for (let i = startLine; i < startLine + atomCount && i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 3) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            const z = parseFloat(parts[2]);
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                coords.push({ x, y, z });
            }
        }
    }

    return calculateGridboxFromCoords(coords, padding);
}

/**
 * Calculate gridbox from receptor using HETATM (ligand) atoms
 * Useful when receptor PDB contains a bound ligand
 */
export function calculateGridboxFromBoundLigand(pdbContent: string, padding = 10): Gridbox {
    const coords: Coordinate[] = [];
    const lines = pdbContent.split('\n');

    for (const line of lines) {
        // HETATM are typically ligands, ions, water
        if (line.startsWith('HETATM')) {
            // Skip water (HOH, WAT)
            const resName = line.substring(17, 20).trim();
            if (resName === 'HOH' || resName === 'WAT') continue;

            const x = parseFloat(line.substring(30, 38));
            const y = parseFloat(line.substring(38, 46));
            const z = parseFloat(line.substring(46, 54));

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                coords.push({ x, y, z });
            }
        }
    }

    if (coords.length === 0) {
        // No bound ligand found, center on protein
        return calculateGridboxFromPDBQT(pdbContent, padding);
    }

    return calculateGridboxFromCoords(coords, padding);
}
