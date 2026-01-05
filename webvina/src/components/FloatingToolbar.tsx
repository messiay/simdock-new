import { useState } from 'react';
import { useDockingStore } from '../store/dockingStore';
import { ViewSettingsPanel } from './ViewSettingsPanel';
import './FloatingToolbar.css';

export function FloatingToolbar() {
    const { viewMode, setViewMode, triggerResetView } = useDockingStore();
    const [showSettings, setShowSettings] = useState(false);

    return (
        <>
            {showSettings && <ViewSettingsPanel />}

            <div className="floating-toolbar">
                <div className="toolbar-group">
                    <button
                        className={`tool-btn ${viewMode === 'cartoon' ? 'active' : ''}`}
                        onClick={() => setViewMode('cartoon')}
                        title="Cartoon Representation"
                    >
                        <span className="icon">🧬</span>
                        <span className="label">Cartoon</span>
                    </button>
                    <button
                        className={`tool-btn ${viewMode === 'sticks' ? 'active' : ''}`}
                        onClick={() => setViewMode('sticks')}
                        title="Sticks Representation"
                    >
                        <span className="icon">🧪</span>
                        <span className="label">Sticks</span>
                    </button>
                    <button
                        className={`tool-btn ${viewMode === 'surface' ? 'active' : ''}`}
                        onClick={() => setViewMode('surface')}
                        title="Surface Representation"
                    >
                        <span className="icon">🌫️</span>
                        <span className="label">Surface</span>
                    </button>
                </div>

                <div className="divider"></div>

                <div className="toolbar-group">
                    <button
                        className={`tool-btn ${showSettings ? 'active' : ''}`}
                        onClick={() => setShowSettings(!showSettings)}
                        title="View Settings & Layers"
                    >
                        <span className="icon">📑</span>
                        <span className="label">Layers</span>
                    </button>

                    <button
                        className="tool-btn"
                        onClick={() => triggerResetView()}
                        title="Reset Camera View"
                    >
                        <span className="icon">🔄</span>
                        <span className="label">Reset</span>
                    </button>
                </div>
            </div>
        </>
    );
}
