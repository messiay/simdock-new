import { useEffect, useRef, useState, useCallback } from 'react';
import { useDockingStore } from '../store/dockingStore';
import './MoleculeViewer.css';

// Declare 3Dmol on window
declare global {
    interface Window {
        $3Dmol: any;
    }
}

export function MoleculeViewer() {
    // Use a separate ref for the 3Dmol container that React won't manage
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerInstanceRef = useRef<any>(null);
    const scriptLoadedRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);

    // Consume global state including VIEW CONTROL
    const {
        receptorFile,
        ligandFile,
        params,
        result,
        selectedPose,
        viewMode,
        resetViewTrigger,
        theme,
        showGrid,
        showAxes,
        showBox,
    } = useDockingStore();

    // Initialize the viewer
    const initializeViewer = useCallback(() => {
        if (!containerRef.current || !window.$3Dmol || viewerInstanceRef.current) return;

        try {
            // Initial background based on current theme
            const bgColor = theme === 'light' ? '#FFFFFF' : '#000000';

            const viewer = window.$3Dmol.createViewer(containerRef.current, {
                backgroundColor: bgColor,
                antialias: true,
            });

            viewerInstanceRef.current = viewer;
            viewer.render();
            setIsReady(true);
        } catch (error) {
            console.error('Failed to initialize 3Dmol viewer:', error);
        }
    }, [theme]);

    // Load 3Dmol.js script only once
    useEffect(() => {
        if (window.$3Dmol) {
            setIsLoading(false);
            scriptLoadedRef.current = true;
            return;
        }

        const existingScript = document.querySelector('script[src="/3Dmol-min.js"]');
        if (existingScript) {
            const checkLoaded = setInterval(() => {
                if (window.$3Dmol) {
                    setIsLoading(false);
                    scriptLoadedRef.current = true;
                    clearInterval(checkLoaded);
                }
            }, 100);
            return () => clearInterval(checkLoaded);
        }

        const script = document.createElement('script');
        script.src = '/3Dmol-min.js';
        script.async = true;
        script.onload = () => {
            setIsLoading(false);
            scriptLoadedRef.current = true;
        };
        script.onerror = () => {
            console.error('Failed to load 3Dmol.js');
            setIsLoading(false);
        };
        document.head.appendChild(script);
        return () => { };
    }, []);

    // Initialize viewer when script is loaded
    useEffect(() => {
        if (!isLoading && containerRef.current && !viewerInstanceRef.current) {
            initializeViewer();
        }
    }, [isLoading, initializeViewer]);

    // Handle Theme Change
    useEffect(() => {
        if (viewerInstanceRef.current) {
            const bgColor = theme === 'light' ? '#FFFFFF' : '#000000';
            viewerInstanceRef.current.setBackgroundColor(bgColor);
            viewerInstanceRef.current.render();
        }
    }, [theme]);

    // Handle Reset View Trigger
    useEffect(() => {
        if (resetViewTrigger > 0 && viewerInstanceRef.current) {
            viewerInstanceRef.current.zoomTo();
            viewerInstanceRef.current.render();
        }
    }, [resetViewTrigger]);

    // Cleanup viewer on unmount
    useEffect(() => {
        return () => {
            if (viewerInstanceRef.current) {
                try {
                    viewerInstanceRef.current.clear();
                } catch (e) { }
                viewerInstanceRef.current = null;
            }
        };
    }, []);

    // MAIN RENDER LOOP: Update viewer when files/params/viewMode change
    useEffect(() => {
        if (!isReady || !viewerInstanceRef.current) return;

        const viewer = viewerInstanceRef.current;

        try {
            // DETERMINE COLORS BASED ON THEME
            const isDark = theme === 'dark';
            const colors = {
                accent: isDark ? '#4DA3FF' : '#3B82F6', // Molecular Blue
                grid: isDark ? '#2A313B' : '#E5E7EB',   // Subtle grid
                boxOpacity: isDark ? 0.15 : 0.1,
                axisFont: isDark ? 'white' : '#111827',
                axisBg: isDark ? 'black' : 'white',
            };

            // Check if we have results and a valid pose
            const hasResult = !!(result && result.poses && result.poses[selectedPose]);
            const ligandContent = hasResult
                ? result!.poses[selectedPose].pdbqt
                : ligandFile?.content;

            viewer.removeAllModels();
            viewer.removeAllShapes();

            // Add receptor
            if (receptorFile?.content) {
                // If it's explicitly sdf or ends in .sdf, use sdf. Vina needs PDBQT but viewer can show others.
                let format = receptorFile.format || 'pdb';
                if (format === 'pdbqt') format = 'pdb'; // 3Dmol doesn't support pdbqt natively

                viewer.addModel(receptorFile.content, format);

                // Apply style based on view mode
                if (viewMode === 'cartoon') {
                    viewer.setStyle({ model: 0 }, { cartoon: { color: 'spectrum' } });
                } else if (viewMode === 'sticks') {
                    viewer.setStyle({ model: 0 }, { stick: { colorscheme: 'Jmol' } });
                } else if (viewMode === 'surface') {
                    viewer.setStyle({ model: 0 }, { cartoon: { color: 'spectrum', opacity: 0.5 } });
                    // Surface is added as a shape/surface, not style
                    viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
                        opacity: 0.7,
                        color: 'white',
                    }, { model: 0 });
                }
            }

            // ADD LIGAND
            if (ligandContent && ligandContent.trim().length > 0) {

                // Determine format logic
                let format = 'pdb'; // Fallback
                if (hasResult) {
                    format = 'pdb'; // Results are PDBQT strings, treated as PDB by 3Dmol (mostly works)
                } else if (ligandFile?.format) {
                    format = ligandFile.format === 'pdbqt' ? 'pdb' : ligandFile.format;
                }

                // IMPORTANT: If we have a receptor, the ligand is the SECOND model (index 1)
                // If not, it's the FIRST (index 0).
                const ligandModel = viewer.addModel(ligandContent, format);

                if (ligandModel) {
                    // Style ligand with bright colors and thicker sticks
                    viewer.setStyle({ model: receptorFile?.content ? 1 : 0 }, {
                        stick: {
                            colorscheme: 'greenCarbon', // Distinct green for ligand
                            radius: 0.3,
                        },
                        sphere: {
                            colorscheme: 'greenCarbon',
                            scale: 0.3,
                        }
                    });
                }
            }

            // Add docking box visualization
            if (showBox && params.sizeX > 0 && params.sizeY > 0 && params.sizeZ > 0) {
                const { centerX, centerY, centerZ, sizeX, sizeY, sizeZ } = params;

                const halfX = sizeX / 2;
                const halfY = sizeY / 2;
                const halfZ = sizeZ / 2;

                const corners = [
                    [centerX - halfX, centerY - halfY, centerZ - halfZ],
                    [centerX + halfX, centerY - halfY, centerZ - halfZ],
                    [centerX + halfX, centerY + halfY, centerZ - halfZ],
                    [centerX - halfX, centerY + halfY, centerZ - halfZ],
                    [centerX - halfX, centerY - halfY, centerZ + halfZ],
                    [centerX + halfX, centerY - halfY, centerZ + halfZ],
                    [centerX + halfX, centerY + halfY, centerZ + halfZ],
                    [centerX - halfX, centerY + halfY, centerZ + halfZ],
                ];

                const edges = [
                    [0, 1], [1, 2], [2, 3], [3, 0],
                    [4, 5], [5, 6], [6, 7], [7, 4],
                    [0, 4], [1, 5], [2, 6], [3, 7],
                ];

                for (const [i, j] of edges) {
                    viewer.addCylinder({
                        start: { x: corners[i][0], y: corners[i][1], z: corners[i][2] },
                        end: { x: corners[j][0], y: corners[j][1], z: corners[j][2] },
                        radius: 0.05,
                        color: '#00d9ff',
                        fromCap: true,
                        toCap: true,
                    });
                }

                // Add transparent box surface for better visibility
                viewer.addBox({
                    center: { x: centerX, y: centerY, z: centerZ },
                    dimensions: { w: sizeX, h: sizeY, d: sizeZ },
                    color: '#00d9ff',
                    opacity: 0.1
                });
            }

            // --- AXES ---
            if (showAxes) {
                const axisLen = 12.0;
                const origin = { x: 0, y: 0, z: 0 };

                // X Axis (Red)
                viewer.addArrow({
                    start: origin, end: { x: axisLen, y: 0, z: 0 },
                    radius: 0.12, color: '#FF6B6B', clickable: false
                });
                viewer.addLabel("X", {
                    position: { x: axisLen + 2, y: 0, z: 0 },
                    fontColor: '#FF6B6B', backgroundColor: colors.axisBg, backgroundOpacity: 0.8, fontSize: 12
                });

                // Y Axis (Green)
                viewer.addArrow({
                    start: origin, end: { x: 0, y: axisLen, z: 0 },
                    radius: 0.12, color: '#3FE0C5', clickable: false
                });
                viewer.addLabel("Y", {
                    position: { x: 0, y: axisLen + 2, z: 0 },
                    fontColor: '#3FE0C5', backgroundColor: colors.axisBg, backgroundOpacity: 0.8, fontSize: 12
                });

                // Z Axis (Blue)
                viewer.addArrow({
                    start: origin, end: { x: 0, y: 0, z: axisLen },
                    radius: 0.12, color: '#4DA3FF', clickable: false
                });
                viewer.addLabel("Z", {
                    position: { x: 0, y: 0, z: axisLen + 2 },
                    fontColor: '#4DA3FF', backgroundColor: colors.axisBg, backgroundOpacity: 0.8, fontSize: 12
                });
            }

            // --- GRID ---
            if (showGrid) {
                const gridSize = 40;
                const step = 5;
                const yLevel = -20;

                for (let i = -gridSize; i <= gridSize; i += step) {
                    viewer.addLine({
                        start: { x: -gridSize, y: yLevel, z: i },
                        end: { x: gridSize, y: yLevel, z: i },
                        color: colors.grid,
                        linewidth: 1
                    });
                    viewer.addLine({
                        start: { x: i, y: yLevel, z: -gridSize },
                        end: { x: i, y: yLevel, z: gridSize },
                        color: colors.grid,
                        linewidth: 1
                    });
                }
            }


            // ZOOM UPDATE
            viewer.zoomTo();
            viewer.render();

        } catch (error) {
            console.error('Error updating viewer:', error);
        }
    }, [receptorFile, ligandFile, params, viewMode, isReady, result, selectedPose, showGrid, showAxes, showBox]);

    return (
        <div className="molecule-viewer">
            <div className="viewer-container-wrapper">
                {/* 3Dmol container - no React children inside */}
                <div
                    className="viewer-canvas"
                    ref={containerRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        backgroundColor: theme === 'light' ? '#FFFFFF' : '#000000' // Force strict background
                    }}
                />

                {isLoading && (
                    <div className="viewer-overlay">
                        <div className="loading-spinner" />
                        <p>Loading 3D Viewer...</p>
                    </div>
                )}

                {isReady && !receptorFile && !ligandFile && (
                    <div className={`viewer-overlay viewer-placeholder ${theme}`}>
                        <span className="placeholder-icon">🧬</span>
                        <p>SimDock 3D Space</p>
                    </div>
                )}
            </div>
        </div>
    );
}
