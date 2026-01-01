/**
 * PDB/SDF to PDBQT Converter
 * 
 * Implements basic conversion from PDB (protein) and SDF (ligand) formats
 * to PDBQT format required by AutoDock Vina.
 * 
 * Note: This is a simplified JavaScript implementation. For production use,
 * consider using Open Babel or a more comprehensive conversion library.
 */

// AutoDock atom type mapping from element symbols
const AUTODOCK_ATOM_TYPES: Record<string, string> = {
    'C': 'C',   // Carbon
    'A': 'A',   // Aromatic carbon (detected by context)
    'N': 'N',   // Nitrogen (not H-bond acceptor)
    'NA': 'NA', // Nitrogen H-bond acceptor
    'NS': 'NS', // Nitrogen with lone pair
    'O': 'O',   // Oxygen (not H-bond acceptor)
    'OA': 'OA', // Oxygen H-bond acceptor
    'F': 'F',   // Fluorine
    'P': 'P',   // Phosphorus
    'S': 'S',   // Sulfur (not H-bond acceptor)
    'SA': 'SA', // Sulfur H-bond acceptor
    'CL': 'Cl', // Chlorine
    'BR': 'Br', // Bromine
    'I': 'I',   // Iodine
    'H': 'H',   // Hydrogen (non-polar)
    'HD': 'HD', // Hydrogen (polar, bonded to O/N)
};

// Default Gasteiger charges by atom/residue type
const DEFAULT_CHARGES: Record<string, number> = {
    'C': 0.0,
    'CA': -0.0178,   // Alpha carbon
    'CB': -0.0312,   // Beta carbon
    'N': -0.3479,    // Backbone nitrogen
    'O': -0.5679,    // Backbone oxygen
    'OXT': -0.8014,  // C-terminal oxygen
    'H': 0.1984,     // Hydrogen
    'HA': 0.0688,
    'HN': 0.2719,
    'DEFAULT': 0.0
};

interface Atom {
    serial: number;
    name: string;
    resName: string;
    chainId: string;
    resSeq: number;
    x: number;
    y: number;
    z: number;
    element: string;
    charge: number;
    atomType: string;
}

/**
 * Determine AutoDock atom type from element and context
 */
function getAutoDockAtomType(element: string, atomName: string, resName: string, bonds: string[] = []): string {
    const el = element.toUpperCase().trim();
    const name = atomName.toUpperCase().trim();

    // Hydrogen - check if polar (bound to N or O)
    if (el === 'H') {
        if (name.startsWith('H') && (name.includes('N') || name.includes('O') || name === 'HN' || name === 'HO')) {
            return 'HD';
        }
        // Check if attached to N or O based on atom name patterns
        if (['HN', 'HG', 'HH', 'HE', 'HZ', 'HG1', 'HE2', 'HD1', 'HD2'].includes(name)) {
            return 'HD';
        }
        return 'H';
    }

    // Oxygen - usually H-bond acceptor except in some special cases
    if (el === 'O') {
        return 'OA';
    }

    // Nitrogen - classify based on residue context
    if (el === 'N') {
        // Histidine can be acceptor or not
        if (resName === 'HIS' && ['ND1', 'NE2'].includes(name)) {
            return 'NA'; // Imidazole nitrogen
        }
        // Backbone nitrogen is usually acceptor
        if (name === 'N') {
            return 'N'; // Backbone amide nitrogen - typically not acceptor
        }
        // Side chain nitrogens
        if (['NZ', 'NH1', 'NH2', 'NE'].includes(name)) {
            return 'N'; // Charged nitrogens in lysine, arginine
        }
        return 'NA'; // Default to acceptor
    }

    // Sulfur - check if H-bond acceptor
    if (el === 'S') {
        if (resName === 'MET' || name === 'SD') {
            return 'SA'; // Methionine sulfur can accept H-bonds
        }
        return 'S';
    }

    // Carbon - check if aromatic
    if (el === 'C') {
        // Aromatic residues
        if (['PHE', 'TYR', 'TRP', 'HIS'].includes(resName)) {
            const aromaticAtoms = ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ', 'CE3', 'CZ2', 'CZ3', 'CH2'];
            if (aromaticAtoms.some(a => name.startsWith(a))) {
                return 'A'; // Aromatic carbon
            }
        }
        return 'C';
    }

    // Halogens
    if (el === 'CL') return 'Cl';
    if (el === 'BR') return 'Br';

    // Default to element
    return AUTODOCK_ATOM_TYPES[el] || el;
}

/**
 * Estimate Gasteiger charge for an atom
 */
function estimateCharge(atomName: string, resName: string, element: string): number {
    const name = atomName.toUpperCase().trim();

    // Look up specific atom name first
    if (DEFAULT_CHARGES[name] !== undefined) {
        return DEFAULT_CHARGES[name];
    }

    // Estimate by element
    switch (element.toUpperCase()) {
        case 'C': return 0.0;
        case 'N': return -0.35;
        case 'O': return -0.50;
        case 'S': return -0.12;
        case 'H': return 0.15;
        case 'P': return 0.40;
        default: return DEFAULT_CHARGES['DEFAULT'];
    }
}

/**
 * Parse a PDB file and extract atoms
 */
function parsePDB(pdbContent: string): Atom[] {
    const atoms: Atom[] = [];
    const lines = pdbContent.split('\n');

    for (const line of lines) {
        if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) {
            continue;
        }

        try {
            const serial = parseInt(line.substring(6, 11).trim()) || atoms.length + 1;
            const atomName = line.substring(12, 16).trim();
            const resName = line.substring(17, 20).trim();
            const chainId = line.substring(21, 22).trim() || 'A';
            const resSeq = parseInt(line.substring(22, 26).trim()) || 1;
            const x = parseFloat(line.substring(30, 38).trim());
            const y = parseFloat(line.substring(38, 46).trim());
            const z = parseFloat(line.substring(46, 54).trim());

            // Element is usually in columns 77-78, but may need to infer from atom name
            let element = line.length >= 78 ? line.substring(76, 78).trim() : '';
            if (!element) {
                // Infer from atom name (first non-digit character)
                element = atomName.replace(/[0-9]/g, '').charAt(0) || 'C';
            }

            const atomType = getAutoDockAtomType(element, atomName, resName);
            const charge = estimateCharge(atomName, resName, element);

            atoms.push({
                serial,
                name: atomName,
                resName,
                chainId,
                resSeq,
                x, y, z,
                element,
                charge,
                atomType
            });
        } catch {
            // Skip malformed lines
            continue;
        }
    }

    return atoms;
}

/**
 * Parse an SDF file and extract atoms (V2000 format)
 */
function parseSDF(sdfContent: string): Atom[] {
    const atoms: Atom[] = [];
    const lines = sdfContent.split('\n');

    // Find the counts line (4th line, or after header)
    let countsLineIndex = 3;
    while (countsLineIndex < lines.length && !lines[countsLineIndex].match(/^\s*\d+\s+\d+/)) {
        countsLineIndex++;
    }

    if (countsLineIndex >= lines.length) {
        throw new Error('Could not find counts line in SDF file');
    }

    const countsLine = lines[countsLineIndex];
    const numAtoms = parseInt(countsLine.substring(0, 3).trim());

    // Parse atom block
    for (let i = 0; i < numAtoms; i++) {
        const atomLine = lines[countsLineIndex + 1 + i];
        if (!atomLine) continue;

        try {
            const x = parseFloat(atomLine.substring(0, 10).trim());
            const y = parseFloat(atomLine.substring(10, 20).trim());
            const z = parseFloat(atomLine.substring(20, 30).trim());
            const element = atomLine.substring(31, 34).trim();

            // Create atom name from element and index
            const atomName = `${element}${i + 1}`;
            const atomType = getAutoDockAtomType(element, atomName, 'LIG');
            const charge = estimateCharge(atomName, 'LIG', element);

            atoms.push({
                serial: i + 1,
                name: atomName,
                resName: 'LIG',
                chainId: 'A',
                resSeq: 1,
                x, y, z,
                element,
                charge,
                atomType
            });
        } catch {
            continue;
        }
    }

    return atoms;
}

/**
 * Format a single atom as a PDBQT line
 */
function formatPDBQTLine(atom: Atom): string {
    // PDBQT format:
    // ATOM  serial name  resName chain resSeq    x       y       z     occupancy tempFactor   charge atomType
    // 1-6   7-11   13-16 18-20   22    23-26     31-38   39-46   47-54 55-60     61-66        67-76  77-78

    const recordType = atom.resName === 'LIG' ? 'HETATM' : 'ATOM  ';
    const serial = atom.serial.toString().padStart(5);
    const name = atom.name.length <= 3 ? ` ${atom.name}`.padEnd(4) : atom.name.padEnd(4);
    const resName = atom.resName.padEnd(3);
    const chainId = atom.chainId || ' ';
    const resSeq = atom.resSeq.toString().padStart(4);
    const x = atom.x.toFixed(3).padStart(8);
    const y = atom.y.toFixed(3).padStart(8);
    const z = atom.z.toFixed(3).padStart(8);
    const occupancy = '  1.00';
    const tempFactor = '  0.00';
    const charge = atom.charge.toFixed(3).padStart(8);
    const atomType = atom.atomType.padStart(2);

    return `${recordType}${serial} ${name} ${resName} ${chainId}${resSeq}    ${x}${y}${z}${occupancy}${tempFactor}    ${charge} ${atomType}`;
}

/**
 * Convert PDB content to PDBQT format
 */
export function convertPDBtoPDBQT(pdbContent: string): string {
    const atoms = parsePDB(pdbContent);

    if (atoms.length === 0) {
        throw new Error('No atoms found in PDB file');
    }

    const lines: string[] = [];

    // Add header
    lines.push('REMARK  Converted to PDBQT by SimDock Pro');
    lines.push('REMARK  Charges are estimated (not actual Gasteiger charges)');

    // Track chains/residues for TER records
    let lastChain = '';
    let lastResSeq = -1;

    for (const atom of atoms) {
        // Add TER record when chain changes
        if (lastChain && atom.chainId !== lastChain) {
            lines.push('TER');
        }

        lines.push(formatPDBQTLine(atom));
        lastChain = atom.chainId;
        lastResSeq = atom.resSeq;
    }

    lines.push('TER');
    lines.push('END');

    return lines.join('\n');
}

/**
 * Convert SDF content to PDBQT format (for ligands)
 */
export function convertSDFtoPDBQT(sdfContent: string): string {
    const atoms = parseSDF(sdfContent);

    if (atoms.length === 0) {
        throw new Error('No atoms found in SDF file');
    }

    const lines: string[] = [];

    // Add header
    lines.push('REMARK  Converted to PDBQT by SimDock Pro');
    lines.push('REMARK  SMILES: (not available)');
    lines.push('REMARK  Charges are estimated (not actual Gasteiger charges)');
    lines.push('ROOT');

    for (const atom of atoms) {
        lines.push(formatPDBQTLine(atom));
    }

    lines.push('ENDROOT');
    lines.push('TORSDOF 0'); // No rotatable bonds in this simple conversion

    return lines.join('\n');
}

/**
 * Detect format and convert to PDBQT
 */
export function convertToPDBQT(content: string, format: 'pdb' | 'sdf' | 'auto' = 'auto'): string {
    // Auto-detect format
    let detectedFormat = format;
    if (format === 'auto') {
        if (content.includes('V2000') || content.includes('V3000') || content.includes('$$$$')) {
            detectedFormat = 'sdf';
        } else if (content.includes('ATOM') || content.includes('HETATM')) {
            detectedFormat = 'pdb';
        } else {
            throw new Error('Could not determine file format');
        }
    }

    if (detectedFormat === 'sdf') {
        return convertSDFtoPDBQT(content);
    } else {
        return convertPDBtoPDBQT(content);
    }
}

/**
 * Check if content is already in PDBQT format
 * PDBQT files have:
 * 1. AutoDock-specific atom types (like NA, OA, HD, SA) in column 77-78
 * 2. Gasteiger charges in column 67-76
 */
export function isPDBQT(content: string): boolean {
    const lines = content.split('\n');
    let atomCount = 0;
    let pdbqtSpecificAtomTypesFound = 0;
    let validChargesFound = 0;

    // PDBQT-specific atom types that don't appear in standard PDB element column
    const PDBQT_SPECIFIC_TYPES = ['NA', 'NS', 'OA', 'SA', 'HD', 'Cl', 'Br'];
    // Standard element symbols that appear in both PDB and PDBQT
    const STANDARD_ELEMENTS = ['C', 'N', 'O', 'H', 'S', 'P', 'F', 'I', 'A'];

    for (const line of lines) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            atomCount++;

            // Check for PDBQT-specific atom types in column 77-79
            if (line.length >= 79) {
                const atomType = line.substring(77, 79).trim();
                if (PDBQT_SPECIFIC_TYPES.includes(atomType)) {
                    pdbqtSpecificAtomTypesFound++;
                }
            }

            // Check for valid Gasteiger charge (should be a decimal number, not empty)
            if (line.length >= 76) {
                const chargeStr = line.substring(67, 76).trim();
                // PDBQT charges are typically formatted like "  0.123" or " -0.456"
                if (chargeStr && /^-?\d+\.\d+$/.test(chargeStr)) {
                    const charge = parseFloat(chargeStr);
                    if (!isNaN(charge)) {
                        validChargesFound++;
                    }
                }
            }
        }

        // Check for PDBQT-specific keywords
        if (line.startsWith('ROOT') || line.startsWith('ENDROOT') || line.startsWith('BRANCH') || line.startsWith('TORSDOF')) {
            return true; // These are PDBQT ligand-specific keywords
        }
    }

    // If we found PDBQT-specific atom types, it's definitely PDBQT
    if (pdbqtSpecificAtomTypesFound > 0) {
        return true;
    }

    // If most atoms have valid charges, it's likely PDBQT
    if (atomCount > 0 && validChargesFound > atomCount * 0.5) {
        return true;
    }

    return false;
}
