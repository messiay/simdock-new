import { create } from 'zustand';
import type { DockingState, DockingParams, MoleculeFile, DockingResult, TabId } from '../types';

const defaultParams: DockingParams = {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    sizeX: 20,
    sizeY: 20,
    sizeZ: 20,
    cpus: navigator.hardwareConcurrency || 4,
    exhaustiveness: 8,
    numModes: 9,
    energyRange: 3,
    seed: null,
    localOnly: false,
    scoreOnly: false,
    randomizeInput: false,
};

interface DockingStore extends DockingState {
    // Actions
    setReceptorFile: (file: MoleculeFile | null) => void;
    setLigandFile: (file: MoleculeFile | null) => void;
    setCorrectPoseFile: (file: MoleculeFile | null) => void;

    // View State
    viewMode: 'cartoon' | 'sticks' | 'surface';
    resetViewTrigger: number;
    setViewMode: (mode: 'cartoon' | 'sticks' | 'surface') => void;
    triggerResetView: () => void;

    // Theme (Apple-Grade Scientific)
    theme: 'dark' | 'light';
    toggleTheme: () => void;

    // Visual Settings
    showGrid: boolean;
    showAxes: boolean;
    showBox: boolean;
    toggleVisual: (setting: 'grid' | 'axes' | 'box') => void;

    setParams: (params: Partial<DockingParams>) => void;
    resetParams: () => void;

    setRunning: (running: boolean) => void;
    setProgress: (progress: number) => void;
    setStatusMessage: (message: string) => void;
    addConsoleOutput: (line: string) => void;
    clearConsoleOutput: () => void;

    setResult: (result: DockingResult | null) => void;
    setSelectedPose: (pose: number) => void;

    setActiveTab: (tab: TabId) => void;

    startOver: () => void;
}

export const useDockingStore = create<DockingStore>((set) => ({
    // Initial state
    receptorFile: null,
    ligandFile: null,
    correctPoseFile: null,

    params: { ...defaultParams },

    isRunning: false,
    progress: 0,
    statusMessage: '',
    consoleOutput: [],

    result: null,
    selectedPose: 0,
    viewMode: 'cartoon',
    resetViewTrigger: 0,

    activeTab: 'input',

    // Visual Settings Defaults
    showGrid: false,
    showAxes: false,
    showBox: true, // Default to true for docking context

    // Actions
    setReceptorFile: (file) => set({ receptorFile: file }),
    setLigandFile: (file) => set({ ligandFile: file }),
    setCorrectPoseFile: (file) => set({ correctPoseFile: file }),

    setParams: (params) => set((state) => ({
        params: { ...state.params, ...params }
    })),
    resetParams: () => set({ params: { ...defaultParams } }),

    setRunning: (isRunning) => set({ isRunning }),
    setProgress: (progress) => set({ progress }),
    setStatusMessage: (statusMessage) => set({ statusMessage }),
    addConsoleOutput: (line) => set((state) => ({
        consoleOutput: [...state.consoleOutput, line]
    })),
    clearConsoleOutput: () => set({ consoleOutput: [] }),

    setResult: (result) => set({ result }),
    setSelectedPose: (selectedPose) => set({ selectedPose }),

    setActiveTab: (activeTab) => set({ activeTab }),

    startOver: () => set({
        receptorFile: null,
        ligandFile: null,
        correctPoseFile: null,
        params: { ...defaultParams },
        isRunning: false,
        progress: 0,
        statusMessage: '',
        consoleOutput: [],
        result: null,
        selectedPose: 0,
        activeTab: 'input',
        viewMode: 'cartoon',
        resetViewTrigger: 0,
        showGrid: false,
        showAxes: false,
        showBox: true,
    }),

    // View Actions
    setViewMode: (mode) => set({ viewMode: mode }),
    triggerResetView: () => set((state) => ({ resetViewTrigger: state.resetViewTrigger + 1 })),

    toggleVisual: (setting) => set((state) => {
        if (setting === 'grid') return { showGrid: !state.showGrid };
        if (setting === 'axes') return { showAxes: !state.showAxes };
        if (setting === 'box') return { showBox: !state.showBox };
        return {};
    }),

    // Theme State
    theme: 'dark',
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
}));
