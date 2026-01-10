import { useDockingStore } from '../../store/dockingStore';
import { Atom, Layers, ArrowRight, TestTube2, Sparkles } from 'lucide-react';
import '../styles/LandingPanel.css';

export function LandingPanel() {
    const { setActiveTab } = useDockingStore();

    return (
        <div className="landing-overlay">
            <div className="landing-content">

                {/* Header */}
                <div className="landing-header">
                    <div className="logo-badge">
                        <Atom size={48} color="#00d2ff" />
                    </div>
                    <h1>SimDock <span className="pro-tag">Pro</span></h1>
                    <p className="subtitle">Advanced Browser-Based Molecular Docking System</p>
                </div>

                {/* Mode Selection Cards */}
                <div className="mode-grid">

                    {/* Single Docking Card */}
                    <div className="mode-card single" onClick={() => setActiveTab('prep')}>
                        <div className="card-bg"></div>
                        <div className="card-icon">
                            <TestTube2 size={40} />
                        </div>
                        <div className="card-info">
                            <h3>Single Docking</h3>
                            <p>Interactive single-ligand screening with real-time visualization.</p>
                        </div>
                        <div className="card-arrow">
                            <ArrowRight size={20} />
                        </div>
                    </div>

                    {/* Batch Docking Card */}
                    <div className="mode-card batch" onClick={() => setActiveTab('batch')}>
                        <div className="card-bg"></div>
                        <div className="card-icon">
                            <Layers size={40} />
                        </div>
                        <div className="card-info">
                            <h3>Batch Docking</h3>
                            <p>High-throughput M × N screening for library validation.</p>
                        </div>
                        <div className="card-arrow">
                            <ArrowRight size={20} />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="landing-footer">
                    <p><Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Powered by AutoDock Vina (WebAssembly)</p>
                    <span className="version">v3.1.0</span>
                </div>

            </div>
        </div>
    );
}
