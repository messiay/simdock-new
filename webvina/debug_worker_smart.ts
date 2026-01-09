
const alignedLigand = `ATOM      1  C1  LIG A   1       2.000   2.000   2.000  1.00  0.00           C`;
const looseLigand = `ATOM 1 C1 LIG A 1 2.000 2.000 2.000 1.00 0.00 C`;

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
    // ATOM 1 C1 LIG A 1 2.000 2.000 2.000
    // Filter empty strings
    const parts = line.trim().split(/\s+/);
    // Usually PDB parts:
    // 0: ATOM
    // 1: Serial
    // 2: Name
    // 3: ResName
    // 4: Chain
    // 5: ResSeq
    // 6: X
    // 7: Y
    // 8: Z
    // But sometimes Chain is merged or missing.
    // However, X, Y, Z are usually the first 3 floats after the residues.

    // Find first 3 consecutive numbers? 
    // This is risky.

    // Alternative: Try to identify X,Y,Z by position from end?
    // PDB always ends with Element (optional) + Charge (optional).
    // Let's rely on detecting 3 floating point numbers in a row later in the line.

    let floats: number[] = [];
    for (const part of parts) {
        if (/^-?\d*\.\d+$/.test(part) || /^-?\d+\.?$/.test(part)) {
            const val = parseFloat(part);
            if (!isNaN(val)) floats.push(val);
        }
    }

    // If we found at least 3 floats, assume the *last* 3 before OCCUPANCY/TEMPFACTOR are coords?
    // Or just the first 3?
    // In "ATOM 1 N ALA A 1 10.0 20.0 30.0 1.00 0.00", floats are 10.0, 20.0, 30.0, 1.0, 0.0.
    // The coordinates are usually the first 3 "coordinate look-alike" numbers after index 5?

    if (floats.length >= 3) {
        // Simple heuristic: X, Y, Z are floats 0, 1, 2 if we exclude serial/resSeq?
        // Serial (1) is int. ResSeq (1) is int.
        // X, Y, Z have decimals usually in PDBQT.
        // But strict check: 
        // If we have >= 5 floats (X,Y,Z,Occ,Temp), use 0,1,2?
        // If we have 3, use 0,1,2.

        // Let's refine: identify parts that look like coordinates (contain dot).
        const coordLikely = parts.filter(p => p.includes('.') && !isNaN(parseFloat(p)));
        if (coordLikely.length >= 3) {
            return {
                x: parseFloat(coordLikely[0]),
                y: parseFloat(coordLikely[1]),
                z: parseFloat(coordLikely[2])
            };
        }
    }

    return null;
}

function testParsing(name: string, content: string) {
    console.log(`--- Testing ${name} ---`);
    const lines = content.split('\n');
    for (const line of lines) {
        const result = smartParsePdbLine(line);
        console.log(`Line: "${line}" ->`, result);
    }
}

testParsing("Aligned", alignedLigand);
testParsing("Loose", looseLigand);
