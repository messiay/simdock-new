import { useState } from 'react';
import { useDockingStore } from '../store/dockingStore';
import { ReceptorUpload, LigandUpload, CorrectPoseUpload } from './FileUpload';
import { DockingBoxPanel } from './DockingBoxPanel';
import { VinaOptionsPanel } from './VinaOptionsPanel';
import { MoleculeViewer } from './MoleculeViewer';
import { vinaService } from '../services/vinaService';
import { calculateGridboxFromReceptor } from '../utils/gridboxCalculator';
import { pdbToPdbqt, isValidPdbqt } from '../utils/pdbqtParser';
import './InputPanel.css';

export function InputPanel() {
    const {
        receptorFile,
        ligandFile,
        params,
        setParams,
        setRunning,
        setProgress,
        setStatusMessage,
        addConsoleOutput,
        clearConsoleOutput,
        setResult,
        setActiveTab,
    } = useDockingStore();

    const [autoRemoveNonProtein, setAutoRemoveNonProtein] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const canRun = receptorFile && ligandFile;

    const handleAutoBox = () => {
        if (!ligandFile?.content) return;

        const gridbox = calculateGridboxFromReceptor(
            receptorFile?.content || '',
            ligandFile.content,
            5
        );

        setParams(gridbox);
    };

    const handleRunDocking = async () => {
        if (!receptorFile?.content || !ligandFile?.content) {
            setError('Please upload both receptor and ligand files');
            return;
        }

        setError(null);
        setRunning(true);
        setActiveTab('running');
        clearConsoleOutput();

        try {
            // Prepare files (convert to PDBQT if needed)
            let receptorPdbqt = receptorFile.content;
            let ligandPdbqt = ligandFile.content;

            // Convert PDB to PDBQT if needed
            if (receptorFile.format === 'pdb' && !isValidPdbqt(receptorPdbqt)) {
                addConsoleOutput('Converting receptor to PDBQT format...');
                receptorPdbqt = pdbToPdbqt(receptorPdbqt);
            }

            if (ligandFile.format !== 'pdbqt' && !isValidPdbqt(ligandPdbqt)) {
                addConsoleOutput('Converting ligand to PDBQT format...');
                ligandPdbqt = pdbToPdbqt(ligandPdbqt);
            }

            // Run docking
            const result = await vinaService.runDocking(
                receptorPdbqt,
                ligandPdbqt,
                params,
                (message, progress) => {
                    setProgress(progress);
                    setStatusMessage(message);
                    addConsoleOutput(message);
                }
            );

            setResult(result);
            setActiveTab('output');
            addConsoleOutput('\n=== Docking Complete ===');
            addConsoleOutput(`Found ${result.poses.length} binding modes`);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Docking failed';
            setError(errorMessage);
            addConsoleOutput(`ERROR: ${errorMessage}`);
        } finally {
            setRunning(false);
            setProgress(0);
            setStatusMessage('');
        }
    };

    const loadExampleFiles = async () => {
        // Load example receptor (1iep - ABL kinase)
        const exampleReceptor = `ATOM      1  N   ALA A   1      -0.525   1.362   0.000  1.00  0.00           N
ATOM      2  CA  ALA A   1       0.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   ALA A   1       1.520   0.000   0.000  1.00  0.00           C
ATOM      4  O   ALA A   1       2.153   1.039   0.000  1.00  0.00           O
ATOM      5  CB  ALA A   1      -0.507  -0.776  -1.215  1.00  0.00           C
END`;

        const exampleLigand = `ATOM      1  C1  LIG A   1       0.000   0.000   0.000  1.00  0.00           C
ATOM      2  C2  LIG A   1       1.500   0.000   0.000  1.00  0.00           C
ATOM      3  C3  LIG A   1       2.250   1.300   0.000  1.00  0.00           C
ATOM      4  C4  LIG A   1       1.500   2.600   0.000  1.00  0.00           C
ATOM      5  C5  LIG A   1       0.000   2.600   0.000  1.00  0.00           C
ATOM      6  C6  LIG A   1      -0.750   1.300   0.000  1.00  0.00           C
END`;

        useDockingStore.getState().setReceptorFile({
            name: 'example_receptor.pdb',
            content: exampleReceptor,
            format: 'pdb',
        });

        useDockingStore.getState().setLigandFile({
            name: 'example_ligand.pdb',
            content: exampleLigand,
            format: 'pdb',
        });

        // Set default box parameters
        setParams({
            centerX: 1.0,
            centerY: 1.3,
            centerZ: 0.0,
            sizeX: 20,
            sizeY: 20,
            sizeZ: 20,
        });
    };

    return (
        <div className="input-panel">
            <div className="input-section">
                <div className="section-header">
                    <h2>Input Files</h2>
                    <button className="example-btn" onClick={loadExampleFiles}>
                        📥 Use Example Files
                    </button>
                </div>

                <div className="files-grid">
                    <div className="file-column">
                        <ReceptorUpload />

                        <div className="file-option">
                            <input
                                type="checkbox"
                                id="autoRemove"
                                checked={autoRemoveNonProtein}
                                onChange={(e) => setAutoRemoveNonProtein(e.target.checked)}
                            />
                            <label htmlFor="autoRemove">
                                Auto-remove non-protein atoms
                            </label>
                        </div>
                    </div>

                    <div className="file-column">
                        <LigandUpload />
                        <CorrectPoseUpload />

                        {ligandFile && (
                            <button className="auto-box-btn" onClick={handleAutoBox}>
                                📍 Auto-calculate box from ligand
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="viewer-section">
                <MoleculeViewer />
            </div>

            <div className="params-section">
                <div className="params-grid">
                    <DockingBoxPanel />
                    <VinaOptionsPanel />
                </div>
            </div>

            {error && (
                <div className="error-message">
                    <span>⚠️</span> {error}
                </div>
            )}

            <div className="run-section">
                <button
                    className="run-btn"
                    onClick={handleRunDocking}
                    disabled={!canRun}
                >
                    <span className="run-icon">🚀</span>
                    Start Docking
                </button>

                {!canRun && (
                    <p className="run-hint">
                        Upload both receptor and ligand files to start docking
                    </p>
                )}
            </div>
        </div>
    );
}
