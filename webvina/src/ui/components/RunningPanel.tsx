import { useDockingStore } from '../../store/dockingStore';
import { vinaService } from '../../services/vinaService';
import '../styles/RunningPanel.css';

export function RunningPanel() {
    const { progress, statusMessage, consoleOutput, setRunning, setActiveTab } = useDockingStore();

    const handleAbort = () => {
        vinaService.abort();
        setRunning(false);
        setActiveTab('input');
    };

    return (
        <div className="running-panel">
            <div className="running-header">
                <div className="running-icon">
                    <div className="spinner-ring" />
                    <span className="dna-icon">🧬</span>
                </div>
                <h2>Docking in Progress</h2>
                <p className="status-text">{statusMessage || 'Please wait...'}</p>
            </div>

            <div className="progress-section">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <span className="progress-text">{Math.round(progress)}%</span>
            </div>

            <div className="console-section">
                <div className="console-header">
                    <span className="console-icon">💻</span>
                    <span>Console Output</span>
                </div>
                <div className="console-output">
                    {consoleOutput.map((line, i) => (
                        <div key={i} className="console-line">
                            <span className="line-number">{i + 1}</span>
                            <span className="line-content">{line}</span>
                        </div>
                    ))}
                    <div className="console-cursor" />
                </div>
            </div>

            <div className="abort-section">
                <button className="abort-btn" onClick={handleAbort}>
                    ⛔ Abort Docking
                </button>
                <p className="abort-warning">
                    Warning: Aborting will cancel the current docking run
                </p>
            </div>
        </div>
    );
}
