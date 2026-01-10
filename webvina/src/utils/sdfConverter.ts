/**
 * SDF to PDBQT Converter
 * Converts SDF/MOL format to PDBQT format for docking
 */

export function sdfToPdbqt(sdfContent: string): string | null {
    const lines = sdfContent.split('\n');

    if (lines.length < 5) {
        console.warn('[sdfConverter] SDF too short');
        return null;
    }

    // Parse SDF header - atom count is in line 4 (0-indexed line 3)
    const countsLine = lines[3];
    if (!countsLine || countsLine.length < 6) {
        // Try searching for counts line (sometimes header is longer?)
        // V2000 standard says line 4, but let's be safe: look for "V2000" or similar structure
        console.warn('[sdfConverter] Invalid counts line');
        return null; // Strict for now
    }

    const atoms: { x: number; y: number; z: number; symbol: string }[] = [];
    const atomCount = parseInt(countsLine.substring(0, 3).trim(), 10);

    if (isNaN(atomCount) || atomCount <= 0) {
        console.warn('[sdfConverter] Invalid atom count:', atomCount);
        return null;
    }

    // Parse atoms (start at line 5 / index 4)
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
        console.warn('[sdfConverter] No atoms parsed from SDF');
        return null;
    }

    console.info(`[sdfConverter] Converted ${atoms.length} atoms from SDF to PDBQT`);

    // Generate PDBQT lines
    const pdbqtLines: string[] = [];
    for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i];
        const atomNum = i + 1;
        const atomName = atom.symbol.padEnd(4);
        const pdbqtLine = `HETATM${atomNum.toString().padStart(5)} ${atomName} LIG     1    ${atom.x.toFixed(3).padStart(8)}${atom.y.toFixed(3).padStart(8)}${atom.z.toFixed(3).padStart(8)}  1.00  0.00          ${atom.symbol.padStart(2)}`;
        pdbqtLines.push(pdbqtLine);
    }

    pdbqtLines.push('END');
    return pdbqtLines.join('\n');
}

/**
 * Check if content is SDF format
 */
export function isSdfFormat(content: string): boolean {
    const contentLower = content.toLowerCase();
    return contentLower.includes('v2000') ||
        contentLower.includes('v3000') ||
        contentLower.includes('m  end') ||
        content.includes('$$$$');
}

/**
 * Convert any molecule format to PDBQT-compatible format
 */
export function convertToViewableFormat(content: string, format: string): string {
    if (format === 'pdbqt' || format === 'pdb') {
        return content; // Already viewable
    }

    if (format === 'sdf' || format === 'mol' || format === 'sd' || isSdfFormat(content)) {
        return sdfToPdbqt(content) || content; // Fallback to content if failed
    }

    // For other formats, return as-is and let viewer handle
    return content;
}
