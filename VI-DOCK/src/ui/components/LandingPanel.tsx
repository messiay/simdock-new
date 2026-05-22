import { useDockingStore } from '../../store/dockingStore';
import { ArrowRight, TestTube2, Layers } from 'lucide-react';
import '../styles/LandingPanel.css';

export function LandingPanel() {
    const { setActiveTab, setDockingMode } = useDockingStore();

    return (
        <div className="landing-overlay">
            <div className="landing-content">

                {/* Header */}
                <div className="landing-header">
                    <div className="logo-badge">
                        <img src="/logo.png" alt="VIDocks Logo" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
                    </div>
                    <h1>VIDocks <span className="pro-tag">Pro</span></h1>
                    <p className="subtitle">High-Performance Cloud-Powered Molecular Docking</p>
                </div>

                {/* Mode Selection Cards */}
                <div className="mode-grid">

                    {/* Protein-Ligand Docking Card */}
                    <div className="mode-card single" onClick={() => {
                        setDockingMode('vina');
                        setActiveTab('input');
                    }}>
                        <div className="card-bg"></div>
                        <div className="card-icon">
                            <TestTube2 size={40} />
                        </div>
                        <div className="card-info">
                            <h3>Protein-Ligand Docking</h3>
                            <p>Interactive small-molecule screening with real-time visualization.</p>
                        </div>
                        <div className="card-arrow">
                            <ArrowRight size={20} />
                        </div>
                    </div>

                    {/* Protein-Protein Docking Card */}
                    <div className="mode-card batch" onClick={() => {
                        setDockingMode('ppd');
                        setActiveTab('input');
                    }}>
                        <div className="card-bg"></div>
                        <div className="card-icon">
                            <Layers size={40} />
                        </div>
                        <div className="card-info">
                            <h3>Protein-Protein Docking</h3>
                            <p>High-performance LightDock simulations for macromolecular complexes.</p>
                        </div>
                        <div className="card-arrow">
                            <ArrowRight size={20} />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="landing-footer">
                    <span className="version">v3.1.0</span>
                </div>

            </div>
        </div>
    );
}
