# SimDock Pro 🧬

## 🚀 Browser-Based Molecular Docking

SimDock Pro is a high-performance, completely browser-based molecular docking application that powers drug discovery workflows directly in your web browser. It leverages **WebAssembly (WASM)** to run the industry-standard **AutoDock Vina** engine client-side, eliminating the need for complex backend infrastructure.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-3.1-green)
![Status](https://img.shields.io/badge/status-Alpha-orange)

---

## ✨ Features

- **Client-Side Docking**: Runs AutoDock Vina v1.2.3 compiled to WebAssembly (WASM).
- **Zero Install**: No local software installation required—just a modern web browser.
- **Privacy First**: All calculations happen locally on your device; no molecular data is sent to a cloud server.
- **Format Support**:
  - **Receptors**: PDB
  - **Ligands**: PDBQT, SDF (via OpenBabel JS), SMILES (via RDKit JS)
- **Advanced Visualization**: Integrated 3Dmol.js for interaction and analysis.
- **Mission Log**: "Diary" style logging of all docking steps and output.
- **Project Library**: Save and manage docking projects locally using IndexedDB.
- **Smart PDBQT**: Automatic cleanup and preparation of input files.

## 🛠️ Architecture

The application is built on a modern React stack:

- **Frontend**: React 19 + TypeScript + Vite
- **State Management**: Zustand
- **Computation**:
  - **Vina WASM**: Custom Emscripten build of AutoDock Vina.
  - **Web Workers**: Off-main-thread processing (currently single-threaded for stability).
  - **Virtual FS**: Emscripten MEMFS for file handling.
- **Cheminformatics**:
  - **RDKit**: SMILES to 3D generation.
  - **OpenBabel**: File format conversion (SDF -> PDBQT).
- **Storage**: IndexedDB (via `idb` wrapper) for persisting projects and results.

## 📦 Installation

Prerequisites: Node.js (v18+)

```bash
# 1. Clone the repository
git clone https://github.com/messiay/simdock-new.git
cd simdock-new/webvina

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The application will be available at `http://localhost:5173`.

## 🧪 Usage

1.  **Prep**: Import a receptor (PDB ID or file) and ligand (PubChem CID, SMILES, or file).
2.  **Input**: Configure the grid box (`--center_x`, `--size_x`, etc.) visually.
3.  **Dock**: Click "Start Docking". The Vina engine runs in the browser.
4.  **Analyze**: View the docking poses, binding affinities, and interaction details.

## ⚠️ Known Issues

- **Multithreading**: Due to browser security restrictions on `SharedArrayBuffer` (COOP/COEP headers), multithreading is currently disabled (`cpu=1`) to prevent runtime crashes (Error 280032).
- **Performance**: Large search spaces (high exhaustiveness) can be slow on older devices.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Submit a Pull Request.

---
*Powered by AutoDock Vina, Emscripten, and React.*
