
const exampleLigand = `ATOM      1  C1  LIG A   1       2.000   2.000   2.000  1.00  0.00           C
ATOM      2  C2  LIG A   1       3.500   2.000   2.000  1.00  0.00           C
ATOM      3  C3  LIG A   1       4.250   3.300   2.000  1.00  0.00           C
ATOM      4  C4  LIG A   1       3.500   4.600   2.000  1.00  0.00           C
ATOM      5  C5  LIG A   1       2.000   4.600   2.000  1.00  0.00           C
ATOM      6  C6  LIG A   1       1.250   3.300   2.000  1.00  0.00           C
END`;

function translatePdbqt(pdbqtContent: string, center: { x: number; y: number; z: number }): string {
    const lines = pdbqtContent.split('\n');
    const atoms: { line: string; x: number; y: number; z: number }[] = [];
    const otherLines: { index: number; line: string }[] = [];

    // Parse atom lines
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
            const xStr = line.substring(30, 38);
            const yStr = line.substring(38, 46);
            const zStr = line.substring(46, 54);

            const x = parseFloat(xStr.trim());
            const y = parseFloat(yStr.trim());
            const z = parseFloat(zStr.trim());

            console.log(`Line ${i}: "${line}"`);
            console.log(`Parsed X: "${xStr}" -> ${x}`);
            console.log(`Parsed Y: "${yStr}" -> ${y}`);
            console.log(`Parsed Z: "${zStr}" -> ${z}`);

            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                atoms.push({ line, x, y, z });
            } else {
                otherLines.push({ index: i, line });
                console.log(`Failed validation for line ${i}`);
            }
        } else {
            otherLines.push({ index: i, line });
        }
    }

    console.log(`Total atoms found: ${atoms.length}`);
    return atoms.length > 0 ? "Success" : "Failure";
}

translatePdbqt(exampleLigand, { x: 0, y: 0, z: 0 });
