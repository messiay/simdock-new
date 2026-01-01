/**
 * Fetch Panel Component
 * Fetch structures from PDB and PubChem
 */

import { useState } from 'react';
import { pdbService } from '../services/pdbService';
import { pubchemService } from '../services/pubchemService';

interface FetchPanelProps {
    onReceptorFetched: (content: string, id: string, format: string) => void;
    onLigandFetched: (content: string, id: string, format: string) => void;
}

export function FetchPanel({ onReceptorFetched, onLigandFetched }: FetchPanelProps) {
    const [pdbId, setPdbId] = useState('');
    const [pubchemCid, setPubchemCid] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFromPDB = async () => {
        if (!pdbId.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await pdbService.fetchFromRCSB(pdbId);
            onReceptorFetched(result.content, result.id, result.format);
            setPdbId('');
        } catch (err) {
            setError(`Failed to fetch PDB: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchFromPubChem = async () => {
        if (!pubchemCid.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const cid = parseInt(pubchemCid);
            const structure = await pubchemService.get3DStructure(cid);

            if (!structure) {
                throw new Error('No structure found');
            }

            onLigandFetched(structure.content, `CID_${cid}`, structure.format);
            setPubchemCid('');
        } catch (err) {
            setError(`Failed to fetch PubChem: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fetch-panel">
            <h3>Fetch from Databases</h3>

            {error && <div className="fetch-error">{error}</div>}

            <div className="fetch-row">
                <div className="fetch-group">
                    <label>RCSB PDB</label>
                    <div className="fetch-input">
                        <input
                            type="text"
                            placeholder="e.g., 1HWL"
                            value={pdbId}
                            onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && fetchFromPDB()}
                            maxLength={4}
                        />
                        <button onClick={fetchFromPDB} disabled={isLoading || !pdbId}>
                            {isLoading ? '...' : 'Fetch Receptor'}
                        </button>
                    </div>
                </div>

                <div className="fetch-group">
                    <label>PubChem CID</label>
                    <div className="fetch-input">
                        <input
                            type="number"
                            placeholder="e.g., 2244"
                            value={pubchemCid}
                            onChange={(e) => setPubchemCid(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchFromPubChem()}
                        />
                        <button onClick={fetchFromPubChem} disabled={isLoading || !pubchemCid}>
                            {isLoading ? '...' : 'Fetch Ligand'}
                        </button>
                    </div>
                </div>
            </div>

            <p className="fetch-note">
                💡 <strong>Note:</strong> PDB files need conversion to PDBQT for docking.
                SDF ligands work but may have reduced accuracy.
            </p>
        </div>
    );
}

export default FetchPanel;
