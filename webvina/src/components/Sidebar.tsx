import { useDockingStore } from '../store/dockingStore';
import type { TabId } from '../types';
import './Sidebar.css';

interface TabConfig {
    id: TabId;
    label: string;
    icon: string;
    disabled?: () => boolean;
}

export function Sidebar() {
    const { activeTab, setActiveTab, isRunning, result, startOver, theme, toggleTheme } = useDockingStore();

    const tabs: TabConfig[] = [
        { id: 'prep', label: 'Molecule Import', icon: '🔬' },
        { id: 'input', label: 'Input Parameters', icon: '📋' },
        { id: 'existing', label: 'Existing Output', icon: '📂' },
        { id: 'running', label: 'Running Docking', icon: '⚙️', disabled: () => !isRunning },
        { id: 'output', label: 'Output', icon: '📊', disabled: () => !result },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1 className="app-logo">
                    <span className="logo-icon">⚛️</span>
                    <span className="logo-text">SimDock</span>
                </h1>
                <p className="app-subtitle">Browser-Based Molecular Docking</p>
            </div>

            <nav className="sidebar-nav">
                {tabs.map((tab) => {
                    const isDisabled = tab.disabled?.() ?? false;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            className={`nav-tab ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => !isDisabled && setActiveTab(tab.id)}
                            disabled={isDisabled}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                            {isActive && <span className="tab-indicator" />}
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <div className="spacer" style={{ height: '10px' }} />
                <button className="start-over-btn" onClick={startOver}>
                    🔄 Start Over
                </button>
                <div className="footer-info">
                    <p>Powered by AutoDock Vina</p>
                    <p>WebAssembly Edition</p>
                </div>
            </div>
        </aside>
    );
}
