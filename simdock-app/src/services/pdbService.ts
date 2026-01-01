/**
 * PDB Service
 * Fetch protein structures from RCSB PDB and AlphaFold
 */

const RCSB_API = 'https://files.rcsb.org/download';
const ALPHAFOLD_API = 'https://alphafold.ebi.ac.uk/api';

export interface PDBFetchResult {
    id: string;
    format: 'pdb' | 'pdbqt';
    content: string;
    title?: string;
}

export const pdbService = {
    /**
     * Fetch PDB structure from RCSB
     */
    async fetchFromRCSB(pdbId: string): Promise<PDBFetchResult> {
        const id = pdbId.toUpperCase().trim();

        // Try to fetch PDB format
        const response = await fetch(`${RCSB_API}/${id}.pdb`);

        if (!response.ok) {
            throw new Error(`PDB ${id} not found (status ${response.status})`);
        }

        const content = await response.text();

        // Extract title from PDB header
        const titleMatch = content.match(/^TITLE\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : undefined;

        return {
            id,
            format: 'pdb',
            content,
            title
        };
    },

    /**
     * Fetch predicted structure from AlphaFold by UniProt ID
     */
    async fetchFromAlphaFold(uniprotId: string): Promise<PDBFetchResult> {
        const id = uniprotId.toUpperCase().trim();

        // Get model info
        const infoResponse = await fetch(`${ALPHAFOLD_API}/prediction/${id}`);
        if (!infoResponse.ok) {
            throw new Error(`AlphaFold structure for ${id} not found`);
        }

        const info = await infoResponse.json();
        const pdbUrl = info[0]?.pdbUrl;

        if (!pdbUrl) {
            throw new Error(`No PDB URL found for ${id}`);
        }

        // Fetch the actual PDB
        const pdbResponse = await fetch(pdbUrl);
        const content = await pdbResponse.text();

        return {
            id,
            format: 'pdb',
            content,
            title: `AlphaFold prediction for ${id}`
        };
    },

    /**
     * Parse PDB/PDBQT to extract atom coordinates
     */
    parseCoordinates(content: string): { x: number; y: number; z: number }[] {
        const coords: { x: number; y: number; z: number }[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                // PDB format: columns 31-38 (X), 39-46 (Y), 47-54 (Z)
                const x = parseFloat(line.substring(30, 38));
                const y = parseFloat(line.substring(38, 46));
                const z = parseFloat(line.substring(46, 54));

                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    coords.push({ x, y, z });
                }
            }
        }

        return coords;
    }
};
