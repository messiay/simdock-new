import { useDockingStore } from '../../store/dockingStore';
import { saveAs } from 'file-saver';
import { BarChart4, FileSpreadsheet, FileText } from 'lucide-react';
import '../../ui/styles/OutputPanel.css';

export function OutputPanel() {
    const { result, selectedPose, setSelectedPose } = useDockingStore();

    if (!result) {
        return (
            <div className="output-workspace empty">
                <div className="no-results-state">
                    <span className="icon"><BarChart4 size={48} opacity={0.5} /></span>
                    <h2>Ready to Dock</h2>
                    <p>Configure your receptor and ligand, then start the simulation.</p>
                </div>
            </div>
        );
    }

    const handleDownload = (type: 'pdbqt' | 'log' | 'all' | 'csv') => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        if (type === 'pdbqt' || type === 'all') {
            const blob = new Blob([result.rawOutput], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, `webvina_output_${timestamp}.pdbqt`);
        }

        if (type === 'log' || type === 'all') {
            const blob = new Blob([result.logOutput], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, `webvina_log_${timestamp}.txt`);
        }

        if (type === 'csv') {
            const header = 'Mode,Affinity (kcal/mol),RMSD l.b.,RMSD u.b.\n';
            const rows = result.poses.map(p =>
                `${p.mode},${p.affinity},${p.rmsdLB},${p.rmsdUB}`
            ).join('\n');
            const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
            saveAs(blob, `webvina_scores_${timestamp}.csv`);
        }
    };

    return (
        <div className="output-workspace-panel">
            {/* LEFT PANEL: DATA & CONTROLS */}
            <div
                className="workspace-sidebar full-width"
            >
                <div className="sidebar-header">
                    <h3>Docking Results</h3>
                    <div className="toolbar-actions">
                        <button onClick={() => handleDownload('csv')} title="Export CSV">
                            <FileSpreadsheet size={16} /> CSV
                        </button>
                        <button onClick={() => handleDownload('pdbqt')} title="Download PDBQT">
                            <FileText size={16} /> PDBQT
                        </button>
                    </div>
                </div>

                <div className="results-list-container">
                    <table className="pro-table">
                        <thead>
                            <tr>
                                <th>Mode</th>
                                <th>Affinity</th>
                                <th>RMSD</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.poses.map((pose, index) => (
                                <tr
                                    key={pose.mode}
                                    className={selectedPose === index ? 'active' : ''}
                                    onClick={() => setSelectedPose(index)}
                                >
                                    <td className="mode-col">
                                        <span className="mode-number">{pose.mode}</span>
                                        {index === 0 && <span className="badge-best">Best</span>}
                                    </td>
                                    <td className={`affinity-col ${pose.affinity < -7 ? 'high-score' : ''}`}>
                                        {pose.affinity.toFixed(1)}
                                    </td>
                                    <td className="rmsd-col">
                                        {pose.rmsdLB.toFixed(1)} / {pose.rmsdUB.toFixed(1)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="log-panel collapsed">
                    <div className="log-header">
                        <h4>Simulation Log</h4>
                    </div>
                    <pre className="log-content">{result.logOutput}</pre>
                </div>
            </div>
        </div>
    );
}
