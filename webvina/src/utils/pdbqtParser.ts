/**
 * Parse PDBQT file format
 */
export interface PdbqtAtom {
    recordType: string;
    serial: number;
    name: string;
    altLoc: string;
    resName: string;
    chainId: string;
    resSeq: number;
    iCode: string;
    x: number;
    y: number;
    z: number;
    occupancy: number;
    tempFactor: number;
    partialCharge: number;
    atomType: string;
}

/**
 * Parse a PDBQT file and extract atoms
 */
export function parsePdbqt(content: string): PdbqtAtom[] {
    const atoms: PdbqtAtom[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            try {
                const atom: PdbqtAtom = {
                    recordType: line.substring(0, 6).trim(),
                    serial: parseInt(line.substring(6, 11).trim(), 10),
                    name: line.substring(12, 16).trim(),
                    altLoc: line.substring(16, 17).trim(),
                    resName: line.substring(17, 20).trim(),
                    chainId: line.substring(21, 22).trim(),
                    resSeq: parseInt(line.substring(22, 26).trim(), 10),
                    iCode: line.substring(26, 27).trim(),
                    x: parseFloat(line.substring(30, 38).trim()),
                    y: parseFloat(line.substring(38, 46).trim()),
                    z: parseFloat(line.substring(46, 54).trim()),
                    occupancy: parseFloat(line.substring(54, 60).trim()) || 1.0,
                    tempFactor: parseFloat(line.substring(60, 66).trim()) || 0.0,
                    partialCharge: parseFloat(line.substring(70, 76).trim()) || 0.0,
                    atomType: line.substring(77, 79).trim(),
                };
                atoms.push(atom);
            } catch {
                // Skip malformed lines
                continue;
            }
        }
    }

    return atoms;
}

/**
 * Convert PDB to basic PDBQT format
 * Note: This is a simplified conversion - real conversion requires proper
 * charge assignment and atom type detection (typically done by Open Babel)
 */
/**
 * Convert PDB to PDBQT format with improved atom typing
 * Uses residue context to assign correct AutoDock types (A, OA, N, SA, etc.)
 */
export function pdbToPdbqt(pdbContent: string): string {
    const lines = pdbContent.split('\n');
    const outputLines: string[] = [];

    // Lookup table for standard amino acid atom types
    // Format: [Residue][AtomName] = AutoDockType
    const ATOM_TYPES: Record<string, Record<string, string>> = {
        // Backbone (applies to most, override for specific residues like PRO)
        'BACKBONE': {
            'N': 'N', 'CA': 'C', 'C': 'C', 'O': 'OA', 'OXT': 'OA'
        },
        // Aliphatic
        'ALA': { 'CB': 'C' },
        'VAL': { 'CB': 'C', 'CG1': 'C', 'CG2': 'C' },
        'LEU': { 'CB': 'C', 'CG': 'C', 'CD1': 'C', 'CD2': 'C' },
        'ILE': { 'CB': 'C', 'CG1': 'C', 'CG2': 'C', 'CD1': 'C' },
        'MET': { 'CB': 'C', 'CG': 'C', 'SD': 'SA', 'CE': 'C' },
        'PRO': { 'N': 'N', 'CA': 'C', 'CB': 'C', 'CG': 'C', 'CD': 'C', 'C': 'C', 'O': 'OA' },
        // Aromatic
        'PHE': { 'CB': 'C', 'CG': 'A', 'CD1': 'A', 'CD2': 'A', 'CE1': 'A', 'CE2': 'A', 'CZ': 'A' },
        'TYR': { 'CB': 'C', 'CG': 'A', 'CD1': 'A', 'CD2': 'A', 'CE1': 'A', 'CE2': 'A', 'CZ': 'A', 'OH': 'OA' },
        'TRP': { 'CB': 'C', 'CG': 'A', 'CD1': 'A', 'CD2': 'A', 'NE1': 'NA', 'CE2': 'A', 'CE3': 'A', 'CZ2': 'A', 'CZ3': 'A', 'CH2': 'A' },
        'HIS': { 'CB': 'C', 'CG': 'A', 'ND1': 'NA', 'CD2': 'A', 'CE1': 'A', 'NE2': 'NA' },
        // Polar
        'SER': { 'CB': 'C', 'OG': 'OA' },
        'THR': { 'CB': 'C', 'OG1': 'OA', 'CG2': 'C' },
        'CYS': { 'CB': 'C', 'SG': 'SA' },
        'ASN': { 'CB': 'C', 'CG': 'C', 'OD1': 'OA', 'ND2': 'NA' }, // ND2 denotes H-bond donor
        'GLN': { 'CB': 'C', 'CG': 'C', 'CD': 'C', 'OE1': 'OA', 'NE2': 'NA' },
        // Charged
        'ASP': { 'CB': 'C', 'CG': 'C', 'OD1': 'OA', 'OD2': 'OA' },
        'GLU': { 'CB': 'C', 'CG': 'C', 'CD': 'C', 'OE1': 'OA', 'OE2': 'OA' },
        'LYS': { 'CB': 'C', 'CG': 'C', 'CD': 'C', 'CE': 'C', 'NZ': 'N' }, // NZ is donor
        'ARG': { 'CB': 'C', 'CG': 'C', 'CD': 'C', 'NE': 'N', 'CZ': 'C', 'NH1': 'N', 'NH2': 'N' }
    };

    // Helper to get type
    const getAtomType = (resName: string, atomName: string): string => {
        // Normalize
        resName = resName.toUpperCase();
        atomName = atomName.toUpperCase();

        // Check specific residue definition
        if (ATOM_TYPES[resName] && ATOM_TYPES[resName][atomName]) {
            return ATOM_TYPES[resName][atomName];
        }

        // Check backbone
        const backbone = ATOM_TYPES['BACKBONE'];
        if (backbone[atomName]) return backbone[atomName];

        // Fallback: Infer from element
        const element = atomName.replace(/\d+$/, '').substring(0, 2).trim();
        const firstChar = atomName.charAt(0);

        switch (firstChar) {
            case 'C': return 'C';
            case 'N': return 'N';
            case 'O': return 'OA'; // Assume acceptor by default for unknown O
            case 'S': return 'SA';
            case 'H': return 'HD';
            case 'F': return 'F';
            case 'P': return 'P';
            case 'I': return 'I';
        }

        if (element === 'CL') return 'Cl';
        if (element === 'BR') return 'Br';

        return 'A'; // Default to A (Carbon-like) if unknown to avoid crashes? Or C? Let's use C.
    };

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            // Extract atom info (fixed width PDB columns)
            // 0-6: Record name
            // 6-11: Serial
            // 12-16: Atom name
            // 17-20: Residue name
            // ...
            const atomName = line.substring(12, 16).trim();
            const resName = line.substring(17, 20).trim();

            const vinaAtomType = getAtomType(resName, atomName);

            // Reconstruct line with PDBQT format
            // We reuse coordinates and names from PDB, but enforce column widths
            const recordName = line.substring(0, 6);
            const serial = line.substring(6, 11);
            const name = line.substring(12, 16);
            const altLoc = line.substring(16, 17);
            const res = line.substring(17, 20);
            const chain = line.substring(21, 22);
            const resSeq = line.substring(22, 26);
            const insCode = line.substring(26, 27);
            const x = line.substring(30, 38);
            const y = line.substring(38, 46);
            const z = line.substring(46, 54);
            // PDBQT: Charge (71-76) and Type (78-79)
            // " 0.000 " is charge (6 chars + spaces)

            // Construct padded line
            // ATOM   2615  N   ILE A 344      36.756 -10.435  10.428  1.00  0.00     0.000 N 
            const pdbqtLine =
                recordName.padEnd(6) +
                serial.padEnd(5) + ' ' +
                name.padEnd(4) +
                altLoc +
                res.padEnd(3) + ' ' +
                chain +
                resSeq.padEnd(4) +
                insCode + '   ' +
                x.padEnd(8) +
                y.padEnd(8) +
                z.padEnd(8) +
                '  1.00' + // Occupancy (fixed)
                '  0.00' + // Temp factor (fixed)
                '    ' +
                ' 0.000' + // Partial charge
                ' ' +
                vinaAtomType.padEnd(2);

            outputLines.push(pdbqtLine);

        } else if (line.startsWith('TER') || line.startsWith('END')) {
            outputLines.push(line);
        }
    }

    return outputLines.join('\n');
}

/**
 * Validate if content is valid PDBQT format
 */
export function isValidPdbqt(content: string): boolean {
    const lines = content.split('\n');
    let hasAtoms = false;

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            hasAtoms = true;
            // Check minimum line length for PDBQT (should have atom type column)
            if (line.length < 77) {
                return false;
            }
        }
    }

    return hasAtoms;
}

/**
 * Remove non-protein atoms from PDBQT (waters, ions, ligands)
 */
export function removeNonProteinAtoms(pdbqtContent: string): string {
    const proteinResidues = new Set([
        'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
        'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
        // Modified residues
        'HID', 'HIE', 'HIP', 'CYX', 'ASH', 'GLH', 'LYN',
    ]);

    const lines = pdbqtContent.split('\n');
    const outputLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            const resName = line.substring(17, 20).trim();
            if (proteinResidues.has(resName)) {
                outputLines.push(line);
            }
        } else if (!line.startsWith('HETATM')) {
            // Keep non-HETATM records (like TER, END, etc.)
            outputLines.push(line);
        }
    }

    return outputLines.join('\n');
}
