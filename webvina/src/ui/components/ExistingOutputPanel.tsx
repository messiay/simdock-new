import { useCallback } from 'react';
import { useDockingStore } from '../../store/dockingStore';
import { parseVinaOutput } from '../../core/utils/vinaOutputParser';
import { FileUpload } from './FileUpload';
import { Lightbulb, FolderOpen } from 'lucide-react';
import '../styles/ExistingOutputPanel.css';

export function ExistingOutputPanel() {
    const { setReceptorFile, setResult, setActiveTab } = useDockingStore();

    const handleOutputFileLoad = useCallback((file: { name: string; content: string; format: string } | null) => {
        if (!file) return;

        // Parse the output file
        const result = parseVinaOutput('', file.content);

        if (result.poses.length > 0) {
            setResult(result);
            setActiveTab('output');
        }
    }, [setResult, setActiveTab]);

    return (
        <div className="existing-output-panel">
            <div className="panel-header">
                <h2><FolderOpen className="icon" size={24} /> Load Existing Vina Output</h2>
                <p>Visualize results from a previous AutoDock Vina run</p>
            </div>

            <div className="upload-sections">
                <div className="upload-section">
                    <h3>1. Upload Receptor (Optional)</h3>
                    <p className="section-hint">
                        Upload the receptor used for docking to see it alongside the poses
                    </p>
                    <FileUpload
                        label="Receptor File"
                        description="PDBQT, PDB format"
                        acceptedFormats={['pdbqt', 'pdb']}
                        file={null}
                        onFileChange={(file) => file && setReceptorFile(file)}
                    />
                </div>

                <div className="upload-section">
                    <h3>2. Upload Vina Output</h3>
                    <p className="section-hint">
                        Upload the docked ligand poses from a previous Vina run
                    </p>
                    <FileUpload
                        label="Vina Output File"
                        description="PDBQT, OUT, VINA, or TXT format"
                        acceptedFormats={['pdbqt', 'out', 'vina', 'txt']}
                        file={null}
                        onFileChange={handleOutputFileLoad}
                    />
                </div>
            </div>

            <div className="info-box">
                <span className="info-icon"><Lightbulb size={24} /></span>
                <div className="info-content">
                    <h4>Tip: Preparing Your Files</h4>
                    <p>
                        The Vina output file should contain docked poses in PDBQT format with
                        MODEL/ENDMDL markers and REMARK VINA RESULT lines for affinity values.
                    </p>
                </div>
            </div>
        </div>
    );
}
