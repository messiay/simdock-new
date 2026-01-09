import { useEffect } from 'react';
import { useDockingStore } from './store/dockingStore';
import { useUserStore } from './store/userStore';
import { Sidebar } from './ui/components/Sidebar';
import { PrepPanel } from './ui/components/PrepPanel';
import { InputPanel } from './ui/components/InputPanel';
import { ExistingOutputPanel } from './ui/components/ExistingOutputPanel';
import { RunningPanel } from './ui/components/RunningPanel';
import { OutputPanel } from './ui/components/OutputPanel';
import { ProjectPanel } from './ui/components/ProjectPanel';
import { LoginScreen } from './ui/components/LoginScreen';
import { MoleculeViewer } from './ui/components/MoleculeViewer';
import { DraggablePanel } from './ui/components/DraggablePanel';
import { FloatingToolbar } from './ui/components/FloatingToolbar'; // Keep toolbar
import './App.css';

function App() {
  const { activeTab, theme } = useDockingStore();
  const { currentUser } = useUserStore();

  // Sync theme to body class for global CSS variables
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  if (!currentUser) {
    return <LoginScreen />;
  }

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
      case 'projects':
        return (
          <DraggablePanel title="Mission Log" width="400px" initialX={60} initialY={80}>
            <ProjectPanel />
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
        <FloatingToolbar />
        {renderActivePanel()}
      </div>
    </div>
  );
}

export default App;
