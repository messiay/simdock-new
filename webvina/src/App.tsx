import { useEffect } from 'react'; // Added useEffect
import { useDockingStore } from './store/dockingStore';
import { Sidebar } from './components/Sidebar';
import { PrepPanel } from './components/PrepPanel';
import { InputPanel } from './components/InputPanel';
import { ExistingOutputPanel } from './components/ExistingOutputPanel';
import { RunningPanel } from './components/RunningPanel';
import { OutputPanel } from './components/OutputPanel';
import { MoleculeViewer } from './components/MoleculeViewer';
import { DraggablePanel } from './components/DraggablePanel';
import { FloatingToolbar } from './components/FloatingToolbar'; // Added this
import './App.css';

function App() {
  const { activeTab, theme } = useDockingStore();

  // Sync theme to body class for global CSS variables
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  // State to track closed panels (to allow re-opening from sidebar)
  // In this simple version, activeTab controls the SINGLE floating panel.
  // Advanced version could allow multiple. Let's stick to "One Active Tool".

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'prep':
        return (
          <DraggablePanel title="Molecule Import" width="500px" initialX={60} initialY={80}>
            <PrepPanel />
          </DraggablePanel>
        );
      case 'input':
        return (
          <DraggablePanel title="Input Parameters" width="450px" initialX={60} initialY={80}>
            <InputPanel />
          </DraggablePanel>
        );
      case 'existing':
        return (
          <DraggablePanel title="Load Results" width="400px" initialX={60} initialY={200}>
            <ExistingOutputPanel />
          </DraggablePanel>
        );
      case 'running':
        return (
          <DraggablePanel title="Docking Status" width="600px" initialX={window.innerWidth / 2 - 300} initialY={window.innerHeight / 2 - 200}>
            <RunningPanel />
          </DraggablePanel>
        );
      case 'output':
        return (
          <DraggablePanel title="Docking Results" width="450px" initialX={window.innerWidth - 500} initialY={80}>
            <OutputPanel />
          </DraggablePanel>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app spatial-mode">
      {/* LAYER 0: GLOBAL VIEWER */}
      <div className="global-viewer-layer">
        <MoleculeViewer />
      </div>

      {/* LAYER 1: UI OVERLAY */}
      <div className="ui-overlay-layer">
        <Sidebar />

        {/* Floating Controls */}
        <FloatingToolbar />

        {/* Floating Tool Panel */}
        {renderActivePanel()}
      </div>
    </div>
  );
}

export default App;
