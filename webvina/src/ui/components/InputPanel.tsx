import { useState } from 'react';
import { useDockingStore } from '../../store/dockingStore';
import { ReceptorUpload, LigandUpload, CorrectPoseUpload } from './FileUpload';
import { DockingBoxPanel } from './DockingBoxPanel';
import { VinaOptionsPanel } from './VinaOptionsPanel';
import { vinaService } from '../../services/vinaService';
import { calculateGridboxFromReceptor } from '../../utils/gridboxCalculator';
import { pdbToPdbqt, isValidPdbqt } from '../../utils/pdbqtParser';
import { Crosshair, AlertTriangle, PlayCircle } from 'lucide-react';
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

            // For SDF format, convert to PDBQT before sending to worker
            if (ligandFile.format === 'sdf' || ligandPdbqt.includes('V2000') || ligandPdbqt.includes('$$$$') || ligandPdbqt.includes('M  END')) {
                addConsoleOutput('Converting ligand SDF to PDBQT format...');
                const { sdfToPdbqt } = await import('../../utils/sdfConverter');
                const converted = sdfToPdbqt(ligandPdbqt);
                if (converted.includes('HETATM') || converted.includes('ATOM')) {
                    ligandPdbqt = converted;
                    addConsoleOutput('SDF→PDBQT conversion successful!');
                } else {
                    addConsoleOutput('Warning: SDF conversion may have issues, proceeding anyway...');
                }
            } else if (ligandFile.format === 'pdb' && !isValidPdbqt(ligandPdbqt)) {
                addConsoleOutput('Converting ligand PDB to PDBQT format...');
                ligandPdbqt = pdbToPdbqt(ligandPdbqt);
            }

            // Final validation - ensure we have content
            if (!ligandPdbqt || ligandPdbqt.trim().length === 0) {
                throw new Error('Ligand content is empty after conversion');
            }
            addConsoleOutput(`Ligand ready: ${ligandPdbqt.length} characters`);

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

    // Example files removed as per user request


    return (
        <div className="input-panel">
            <div className="input-section">
                <div className="section-header">
                    <h2>Input Files</h2>
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
