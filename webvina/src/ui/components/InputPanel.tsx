import { useState } from 'react';
import { useDockingStore } from '../../store/dockingStore';
import { ReceptorUpload, LigandUpload, CorrectPoseUpload } from './FileUpload';
import { DockingBoxPanel } from './DockingBoxPanel';
import { VinaOptionsPanel } from './VinaOptionsPanel';
import { vinaService } from '../../services/vinaService';
import { calculateGridboxFromReceptor } from '../../utils/gridboxCalculator';
import { pdbToPdbqt, isValidPdbqt } from '../../utils/pdbqtParser';
import { Download, Crosshair, AlertTriangle, PlayCircle } from 'lucide-react';
import '../styles/InputPanel.css';

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
        // Load example receptor (Poly-Alanine Helix Fragment)
        const exampleReceptor = `ATOM      1  N   ALA A   1       0.228  -1.396  -1.631  1.00  0.00           N
ATOM      2  CA  ALA A   1       0.000   0.000   0.000  1.00  0.00           C
ATOM      3  C   ALA A   1       1.275   0.814   0.000  1.00  0.00           C
ATOM      4  O   ALA A   1       1.353   1.897  -0.569  1.00  0.00           O
ATOM      5  CB  ALA A   1      -1.229   0.804  -0.364  1.00  0.00           C
ATOM      6  N   ALA A   2       2.261   0.283   0.658  1.00  0.00           N
ATOM      7  CA  ALA A   2       3.585   0.922   0.725  1.00  0.00           C
ATOM      8  C   ALA A   2       3.843   1.574  -0.638  1.00  0.00           C
ATOM      9  O   ALA A   2       4.332   0.940  -1.569  1.00  0.00           O
ATOM     10  CB  ALA A   2       4.649  -0.108   1.139  1.00  0.00           C
ATOM     11  N   ALA A   3       3.535   2.868  -0.672  1.00  0.00           N
ATOM     12  CA  ALA A   3       3.812   3.738  -1.815  1.00  0.00           C
ATOM     13  C   ALA A   3       5.292   4.102  -1.802  1.00  0.00           C
ATOM     14  O   ALA A   3       5.758   4.722  -2.760  1.00  0.00           O
ATOM     15  CB  ALA A   3       2.934   4.982  -1.740  1.00  0.00           C
ATOM     16  N   ALA A   4       6.035   3.712  -0.767  1.00  0.00           N
ATOM     17  CA  ALA A   4       7.472   3.978  -0.648  1.00  0.00           C
ATOM     18  C   ALA A   4       7.828   5.385  -1.127  1.00  0.00           C
ATOM     19  O   ALA A   4       7.114   6.002  -1.928  1.00  0.00           O
ATOM     20  CB  ALA A   4       8.243   2.910  -1.428  1.00  0.00           C
END`;

        const exampleLigand = `ATOM      1  C1  LIG A   1       2.000   2.000   2.000  1.00  0.00           C
ATOM      2  C2  LIG A   1       3.500   2.000   2.000  1.00  0.00           C
ATOM      3  C3  LIG A   1       4.250   3.300   2.000  1.00  0.00           C
ATOM      4  C4  LIG A   1       3.500   4.600   2.000  1.00  0.00           C
ATOM      5  C5  LIG A   1       2.000   4.600   2.000  1.00  0.00           C
ATOM      6  C6  LIG A   1       1.250   3.300   2.000  1.00  0.00           C
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
                        <Download size={16} /> Use Example Files
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
                                <Crosshair size={16} /> Auto-calculate box from ligand
                            </button>
                        )}
                    </div>
                </div>
            </div>



            <div className="params-section">
                <div className="params-grid">
                    <DockingBoxPanel />
                    <VinaOptionsPanel />
                </div>
            </div>

            {error && (
                <div className="error-message">
                    <span><AlertTriangle size={16} /></span> {error}
                </div>
            )}

            <div className="run-section">
                <button
                    className="run-btn"
                    onClick={handleRunDocking}
                    disabled={!canRun}
                >
                    <span className="run-icon"><PlayCircle size={20} /></span>
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
