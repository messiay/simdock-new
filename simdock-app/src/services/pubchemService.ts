/**
 * PubChem Service
 * Fetch compound structures and info from PubChem
 */

const PUBCHEM_API = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

export interface CompoundInfo {
    cid: number;
    name: string;
    formula: string;
    molecularWeight: number;
    smiles?: string;
}

export interface CompoundStructure {
    cid: number;
    format: 'sdf' | 'mol2';
    content: string;
}

export const pubchemService = {
    /**
     * Search compounds by name
     */
    async searchByName(name: string, limit = 10): Promise<CompoundInfo[]> {
        const url = `${PUBCHEM_API}/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName/JSON`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            const properties = data.PropertyTable?.Properties || [];

            return properties.slice(0, limit).map((p: Record<string, unknown>) => ({
                cid: p.CID as number,
                name: (p.IUPACName as string) || name,
                formula: p.MolecularFormula as string,
                molecularWeight: p.MolecularWeight as number,
                smiles: p.CanonicalSMILES as string
            }));
        } catch {
            return [];
        }
    },

    /**
     * Get compound info by CID
     */
    async getByCID(cid: number): Promise<CompoundInfo | null> {
        const url = `${PUBCHEM_API}/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IUPACName/JSON`;

        try {
            const response = await fetch(url);
            if (!response.ok) return null;

            const data = await response.json();
            const p = data.PropertyTable?.Properties?.[0];
            if (!p) return null;

            return {
                cid: p.CID,
                name: p.IUPACName || `CID ${cid}`,
                formula: p.MolecularFormula,
                molecularWeight: p.MolecularWeight,
                smiles: p.CanonicalSMILES
            };
        } catch {
            return null;
        }
    },

    /**
     * Get 3D structure in SDF format
     */
    async get3DStructure(cid: number): Promise<CompoundStructure | null> {
        const url = `${PUBCHEM_API}/compound/cid/${cid}/SDF?record_type=3d`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Try 2D if 3D not available
                const url2d = `${PUBCHEM_API}/compound/cid/${cid}/SDF`;
                const response2d = await fetch(url2d);
                if (!response2d.ok) return null;

                return {
                    cid,
                    format: 'sdf',
                    content: await response2d.text()
                };
            }

            return {
                cid,
                format: 'sdf',
                content: await response.text()
            };
        } catch {
            return null;
        }
    },

    /**
     * Parse SDF to extract atom coordinates
     */
    parseSDFCoordinates(sdfContent: string): { x: number; y: number; z: number }[] {
        const coords: { x: number; y: number; z: number }[] = [];
        const lines = sdfContent.split('\n');

        // Find counts line (4th line typically)
        let atomCount = 0;
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const match = lines[i].match(/^\s*(\d+)\s+(\d+)/);
            if (match) {
                atomCount = parseInt(match[1]);
                // Atoms start on next line
                for (let j = i + 1; j < i + 1 + atomCount && j < lines.length; j++) {
                    const parts = lines[j].trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const x = parseFloat(parts[0]);
                        const y = parseFloat(parts[1]);
                        const z = parseFloat(parts[2]);
                        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            coords.push({ x, y, z });
                        }
                    }
                }
                break;
            }
        }

        return coords;
    }
};
