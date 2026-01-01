import { useState, useEffect, useRef } from 'react';
import {
  type Project,
  type Receptor,
  type Gridbox,
  projectRepository,
  receptorRepository,
  dockingJobRepository
} from './db';
import { dockingService, type ParsedResult } from './services/dockingService';
import { calculateGridboxFromPDBQT, calculateGridboxFromSDF, calculateGridboxFromBoundLigand } from './utils/gridboxCalculator';
import { FileUpload } from './components/FileUpload';
import { FetchPanel } from './components/FetchPanel';
import './App.css';

function App() {
  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');

  // Molecule state
  const [receptorContent, setReceptorContent] = useState<string>('');
  const [receptorName, setReceptorName] = useState<string>('');
  const [ligandContent, setLigandContent] = useState<string>('');
  const [ligandName, setLigandName] = useState<string>('');
  const [ligandFormat, setLigandFormat] = useState<'pdbqt' | 'sdf'>('pdbqt');

  // Gridbox state
  const [gridbox, setGridbox] = useState<Gridbox>({
    centerX: 0, centerY: 0, centerZ: 0,
    sizeX: 20, sizeY: 20, sizeZ: 20
  });
  const [autoGrid, setAutoGrid] = useState(true);

  // Docking state
  const [isDocking, setIsDocking] = useState(false);
  const [dockingLogs, setDockingLogs] = useState<string[]>([]);
  const [dockingProgress, setDockingProgress] = useState(0);
  const [dockingResults, setDockingResults] = useState<ParsedResult[]>([]);
  const [dockingTime, setDockingTime] = useState<number | null>(null);
  const [selectedReceptor, setSelectedReceptor] = useState<Receptor | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load receptors when project changes
  useEffect(() => {
    if (selectedProject) {
      loadReceptors(selectedProject.id!);
    }
  }, [selectedProject]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dockingLogs]);

  // Auto-calculate gridbox when ligand changes
  useEffect(() => {
    if (autoGrid && ligandContent) {
      const newGrid = ligandFormat === 'sdf'
        ? calculateGridboxFromSDF(ligandContent)
        : calculateGridboxFromPDBQT(ligandContent);
      setGridbox(newGrid);
    }
  }, [ligandContent, ligandFormat, autoGrid]);

  const loadProjects = async () => {
    const data = await projectRepository.getAll();
    setProjects(data);
  };

  const loadReceptors = async (projectId: string) => {
    const data = await receptorRepository.getByProject(projectId);
    if (data.length > 0) {
      setSelectedReceptor(data[0]);
      setReceptorContent(data[0].pdbqtContent);
      setReceptorName(data[0].name);
      if (data[0].gridbox) {
        setGridbox(data[0].gridbox);
      }
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    await projectRepository.create({ name: newProjectName });
    setNewProjectName('');
    loadProjects();
  };

  const deleteProject = async (id: string) => {
    await projectRepository.delete(id);
    if (selectedProject?.id === id) {
      setSelectedProject(null);
    }
    loadProjects();
  };

  // File upload handlers
  const handleReceptorFile = (content: string, filename: string) => {
    setReceptorContent(content);
    setReceptorName(filename.replace(/\.[^.]+$/, ''));

    // Auto-detect gridbox from bound ligand if present
    if (autoGrid) {
      const grid = calculateGridboxFromBoundLigand(content);
      setGridbox(grid);
    }
  };

  const handleLigandFile = (content: string, filename: string) => {
    setLigandContent(content);
    setLigandName(filename.replace(/\.[^.]+$/, ''));

    // Detect format
    const ext = filename.split('.').pop()?.toLowerCase();
    setLigandFormat(ext === 'sdf' ? 'sdf' : 'pdbqt');
  };

  // API fetch handlers
  const handleReceptorFetched = (content: string, id: string, _format: string) => {
    setReceptorContent(content);
    setReceptorName(id);

    if (autoGrid) {
      const grid = calculateGridboxFromBoundLigand(content);
      setGridbox(grid);
    }
  };

  const handleLigandFetched = (content: string, id: string, format: string) => {
    setLigandContent(content);
    setLigandName(id);
    setLigandFormat(format === 'sdf' ? 'sdf' : 'pdbqt');
  };

  // Save receptor to database
  const saveReceptor = async () => {
    if (!selectedProject || !receptorContent || !receptorName) return;

    await receptorRepository.create({
      projectId: selectedProject.id!,
      name: receptorName,
      pdbqtContent: receptorContent,
      gridbox: gridbox
    });

    loadReceptors(selectedProject.id!);
  };

  // Docking
  const startDocking = async () => {
    if (!receptorContent || !ligandContent) {
      alert('Please load both receptor and ligand first');
      return;
    }

    if (!selectedProject) {
      alert('Please select a project first');
      return;
    }

    setIsDocking(true);
    setDockingLogs([]);
    setDockingProgress(0);
    setDockingResults([]);
    setDockingTime(null);

    // Create docking job
    const job = await dockingJobRepository.create({
      projectId: selectedProject.id!,
      receptorId: selectedReceptor?.id || 'uploaded',
      receptorVersionId: selectedReceptor?.id || 'uploaded',
      engines: ['vina'],
      config: {
        exhaustiveness: 8,
        numModes: 9,
        energyRange: 3
      }
    });

    await dockingService.runDocking(
      job.id!,
      receptorContent,
      ligandContent,
      ligandName,
      {
        ...gridbox,
        exhaustiveness: 8,
        numModes: 9
      },
      {
        onLog: (msg) => setDockingLogs(prev => [...prev, msg]),
        onProgress: (percent) => setDockingProgress(percent),
        onComplete: (results, _output, time) => {
          setDockingResults(results);
          setDockingTime(time);
          setIsDocking(false);
        },
        onError: (error) => {
          setDockingLogs(prev => [...prev, `ERROR: ${error}`]);
          setIsDocking(false);
        }
      }
    );
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🧬 SimDock Pro</h1>
        <p>Sprint 3: File Upload & API Integration</p>
      </header>

      <main className="main">
        {/* Projects Section */}
        <section className="section">
          <h2>Projects</h2>
          <div className="create-form">
            <input
              type="text"
              placeholder="New project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
            />
            <button onClick={createProject}>Create Project</button>
          </div>

          <ul className="list">
            {projects.map((project) => (
              <li
                key={project.id}
                className={`list-item ${selectedProject?.id === project.id ? 'selected' : ''}`}
              >
                <span onClick={() => setSelectedProject(project)}>
                  📁 {project.name}
                </span>
                <button
                  className="delete-btn"
                  onClick={() => deleteProject(project.id!)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Molecule Input Section */}
        {selectedProject && (
          <section className="section molecule-section">
            <h2>📥 Load Molecules</h2>

            {/* Fetch from APIs */}
            <FetchPanel
              onReceptorFetched={handleReceptorFetched}
              onLigandFetched={handleLigandFetched}
            />

            {/* File Upload */}
            <div className="upload-row">
              <FileUpload
                label="Upload Receptor (PDB/PDBQT)"
                accept=".pdb,.pdbqt"
                onFileLoaded={handleReceptorFile}
              />
              <FileUpload
                label="Upload Ligand (PDBQT/SDF)"
                accept=".pdbqt,.sdf,.mol2"
                onFileLoaded={handleLigandFile}
              />
            </div>

            {/* Current loaded files */}
            <div className="loaded-files">
              {receptorName && (
                <div className="loaded-file">
                  🧪 Receptor: <strong>{receptorName}</strong> ({receptorContent.split('\n').length} lines)
                  <button onClick={saveReceptor}>Save to Project</button>
                </div>
              )}
              {ligandName && (
                <div className="loaded-file">
                  💊 Ligand: <strong>{ligandName}</strong> ({ligandFormat.toUpperCase()}, {ligandContent.split('\n').length} lines)
                </div>
              )}
            </div>
          </section>
        )}

        {/* Gridbox Section */}
        {selectedProject && (receptorContent || ligandContent) && (
          <section className="section gridbox-section">
            <h2>📐 Gridbox {autoGrid && <span className="auto-badge">Auto</span>}</h2>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoGrid}
                onChange={(e) => setAutoGrid(e.target.checked)}
              />
              Auto-detect from ligand
            </label>

            <div className="gridbox-inputs">
              <div className="grid-row">
                <label>Center X</label>
                <input type="number" value={gridbox.centerX} onChange={(e) => setGridbox({ ...gridbox, centerX: parseFloat(e.target.value) })} disabled={autoGrid} />
                <label>Y</label>
                <input type="number" value={gridbox.centerY} onChange={(e) => setGridbox({ ...gridbox, centerY: parseFloat(e.target.value) })} disabled={autoGrid} />
                <label>Z</label>
                <input type="number" value={gridbox.centerZ} onChange={(e) => setGridbox({ ...gridbox, centerZ: parseFloat(e.target.value) })} disabled={autoGrid} />
              </div>
              <div className="grid-row">
                <label>Size X</label>
                <input type="number" value={gridbox.sizeX} onChange={(e) => setGridbox({ ...gridbox, sizeX: parseInt(e.target.value) })} disabled={autoGrid} />
                <label>Y</label>
                <input type="number" value={gridbox.sizeY} onChange={(e) => setGridbox({ ...gridbox, sizeY: parseInt(e.target.value) })} disabled={autoGrid} />
                <label>Z</label>
                <input type="number" value={gridbox.sizeZ} onChange={(e) => setGridbox({ ...gridbox, sizeZ: parseInt(e.target.value) })} disabled={autoGrid} />
              </div>
            </div>
          </section>
        )}

        {/* Docking Section */}
        {selectedProject && receptorContent && ligandContent && (
          <section className="section docking-section">
            <h2>🚀 Docking</h2>
            <div className="docking-info">
              <p><strong>Receptor:</strong> {receptorName}</p>
              <p><strong>Ligand:</strong> {ligandName} ({ligandFormat.toUpperCase()})</p>
              <p><strong>Grid Center:</strong> ({gridbox.centerX}, {gridbox.centerY}, {gridbox.centerZ})</p>
            </div>

            <button
              className="dock-btn"
              onClick={startDocking}
              disabled={isDocking}
            >
              {isDocking ? `⏳ Docking... ${dockingProgress}%` : '🚀 Start Docking'}
            </button>

            {isDocking && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${dockingProgress}%` }}></div>
              </div>
            )}
          </section>
        )}

        {/* Docking Logs */}
        {dockingLogs.length > 0 && (
          <section className="section">
            <h2>📝 Docking Logs</h2>
            <div className="log-container">
              {dockingLogs.map((log, i) => (
                <div key={i} className={`log-entry ${log.includes('ERROR') ? 'error' : log.includes('VINA RESULT') ? 'success' : ''}`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </section>
        )}

        {/* Results Table */}
        {dockingResults.length > 0 && (
          <section className="section">
            <h2>📊 Results {dockingTime && <span className="time-badge">{dockingTime.toFixed(1)}s</span>}</h2>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Pose</th>
                  <th>Score (kcal/mol)</th>
                  <th>RMSD L.B.</th>
                  <th>RMSD U.B.</th>
                </tr>
              </thead>
              <tbody>
                {dockingResults.map((r) => (
                  <tr key={r.pose} className={r.pose === 1 ? 'best-pose' : ''}>
                    <td>{r.pose}</td>
                    <td className="score">{r.score.toFixed(2)}</td>
                    <td>{r.rmsdLB.toFixed(2)}</td>
                    <td>{r.rmsdUB.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Debug Section */}
        <section className="section debug">
          <h2>Debug Info</h2>
          <p>Project: {selectedProject?.name || 'None'}</p>
          <p>Receptor: {receptorName || 'None'} ({receptorContent.length} chars)</p>
          <p>Ligand: {ligandName || 'None'} ({ligandFormat})</p>
          <p>Gridbox: center({gridbox.centerX}, {gridbox.centerY}, {gridbox.centerZ})</p>
        </section>
      </main>
    </div>
  );
}

export default App;
