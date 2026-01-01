# SimDock Pro: Methods (Implementation)

## 2. Methods

### 2.1 System Architecture Overview

SimDock Pro employs a fully client-side architecture where all computational processes—molecular docking, data storage, and visualization—execute entirely within the user's web browser. This design eliminates data transmission to external servers, ensuring complete privacy for sensitive pharmaceutical research data.

The system comprises four core subsystems:
1. **Docking Engine(s)** - WebAssembly-compiled AutoDock Vina and SMINA
2. **Data Persistence Layer** - IndexedDB with Dexie.js abstraction  
3. **Version Control System** - "Git for Proteins" receptor versioning
4. **Visualization Interface** - Mol* (Molstar) molecular viewer

### 2.2 Local-First Data Architecture

#### 2.2.1 Design Philosophy

SimDock Pro implements a "local-first" data architecture that stores all project data exclusively in the browser's IndexedDB. This approach provides:

- **Zero Data Egress**: No molecular structures, docking results, or research data leave the user's device
- **Complete Privacy**: Sensitive pharmaceutical compounds remain under researcher control
- **Offline Capability**: Full functionality without network connectivity
- **GDPR/HIPAA Compliance**: No external data processing eliminates regulatory exposure

#### 2.2.2 IndexedDB Implementation via Dexie.js

We utilize Dexie.js v3.x as an abstraction layer over IndexedDB, providing:
- Promise-based API for cleaner async code
- Automatic schema versioning and migrations
- Compound indexing for efficient queries
- Transaction management

**Database Schema Definition:**

```typescript
import Dexie, { Table } from 'dexie';

export interface Project {
  id?: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Receptor {
  id?: string;
  projectId: string;
  name: string;
  pdbId?: string;
  version: number;           // Git-style versioning
  parentVersionId?: string;  // Links to previous version
  pdbqtContent: string;
  gridbox?: Gridbox;
  createdAt: Date;
}

export interface Ligand {
  id?: string;
  projectId: string;
  name: string;
  smiles?: string;
  pubchemCid?: number;
  pdbqtContent: string;
  createdAt: Date;
}

export interface DockingJob {
  id?: string;
  projectId: string;
  receptorId: string;
  receptorVersionId: string;  // Frozen receptor version
  status: 'pending' | 'running' | 'completed' | 'failed';
  engines: ('vina' | 'smina')[];
  config: EngineConfig;
  createdAt: Date;
  completedAt?: Date;
}

export interface DockingResult {
  id?: string;
  jobId: string;
  ligandId: string;
  engine: 'vina' | 'smina';
  pose: number;
  score: number;           // Individual engine score (kcal/mol)
  consensusScore?: number; // Computed consensus score
  rmsd: number;
  pdbqtContent: string;
}

export class SimDockDatabase extends Dexie {
  projects!: Table<Project>;
  receptors!: Table<Receptor>;
  ligands!: Table<Ligand>;
  dockingJobs!: Table<DockingJob>;
  dockingResults!: Table<DockingResult>;

  constructor() {
    super('SimDockPro');
    this.version(1).stores({
      projects: 'id, name, createdAt',
      receptors: 'id, projectId, name, version, parentVersionId, [projectId+name]',
      ligands: 'id, projectId, name, pubchemCid, [projectId+name]',
      dockingJobs: 'id, projectId, receptorId, status, [projectId+status]',
      dockingResults: 'id, jobId, ligandId, engine, [jobId+ligandId], [jobId+score]'
    });
  }
}
```

#### 2.2.3 "Git for Proteins": Receptor Version Control

A key novelty of SimDock Pro is the built-in version control system for receptor structures. During iterative drug discovery, researchers frequently modify binding sites through mutations, protonation state changes, or flexible residue adjustments. Traditional docking tools require manual file management to track these changes.

SimDock Pro implements a Git-inspired versioning system:

```
Receptor Version Tree:
────────────────────────────────────────────────────────────

  v1 (Original PDB: 1HWL)
   │
   ├── v2 (H163A mutation)
   │    │
   │    └── v3 (Protonation fix)
   │
   └── v4 (Alternative binding site)
        │
        └── v5 (Flexible residues defined)

```

**Implementation Details:**

| Field | Purpose |
|-------|---------|
| `version` | Integer version number |
| `parentVersionId` | UUID of parent receptor (null for root) |
| `receptorVersionId` | Frozen in each DockingJob for reproducibility |

This enables:
- **Reproducibility**: Every docking job references a specific receptor version
- **Provenance Tracking**: Complete history of receptor modifications
- **Branch Exploration**: Parallel investigation of alternative binding sites
- **Rollback Capability**: Return to any previous receptor state

### 2.3 Docking Engine Integration

#### 2.3.1 WebAssembly Compilation

SimDock Pro utilizes multiple docking engines compiled to WebAssembly:

| Engine | Source | Scoring Function |
|--------|--------|------------------|
| AutoDock Vina | Webina (Durrant Lab) | Empirical hybrid |
| SMINA | Custom WASM build | Vinardo / Custom |

**Table 1: WASM Performance Benchmark**

| Parameter | Test Configuration |
|-----------|-------------------|
| Receptor | HMG-CoA reductase (PDB: 1HWL) |
| Ligand | Rosuvastatin (35 atoms, 12 rotatable bonds) |
| Grid Box | 20×20×20 Å |
| Exhaustiveness | 8 (standard) |

| Metric | WASM Time | Native C++* | Overhead |
|--------|-----------|-------------|----------|
| Docking Time | 66.62 s | ~45 s | ~48% |
| Best Affinity | -7.1 kcal/mol | -7.1 kcal/mol | 0% |
| Binding Modes | 9 poses | 9 poses | 0% |

*Native C++ times are estimated based on published Vina benchmarks on comparable hardware.

#### 2.3.2 Parallel Multi-Engine Execution

SimDock Pro executes multiple docking engines concurrently using dedicated Web Workers:

**Figure 2.3: Parallel Engine Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Thread                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Job Orchestrator                         ││
│  │   receptorPDBQT + ligandPDBQT + gridParams                  ││
│  └──────────┬────────────────────────────────┬─────────────────┘│
│             │                                │                   │
│             ▼                                ▼                   │
│  ┌─────────────────────┐          ┌─────────────────────┐       │
│  │   Web Worker #1     │          │   Web Worker #2     │       │
│  │  ┌───────────────┐  │          │  ┌───────────────┐  │       │
│  │  │  Vina WASM    │  │          │  │  SMINA WASM   │  │       │
│  │  │  (639 KB)     │  │          │  │  (720 KB)     │  │       │
│  │  └───────────────┘  │          │  └───────────────┘  │       │
│  │         │           │          │         │           │       │
│  │         ▼           │          │         ▼           │       │
│  │   Vina Scores       │          │   SMINA Scores      │       │
│  │   [-7.1, -6.8, ...]│          │   [-7.3, -6.9, ...] │       │
│  └──────────┬──────────┘          └──────────┬──────────┘       │
│             │                                │                   │
│             └────────────┬───────────────────┘                   │
│                          ▼                                       │
│              ┌─────────────────────┐                            │
│              │  Consensus Scoring  │                            │
│              │   (Section 2.4)     │                            │
│              └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.3.3 Security Headers for Multi-Threading

SharedArrayBuffer enables efficient memory sharing between Web Workers but requires specific HTTP security headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
```

These headers isolate the browsing context, preventing Spectre-style side-channel attacks while enabling high-performance multi-threaded docking.

### 2.4 Consensus Scoring

A distinguishing feature of SimDock Pro is its consensus scoring system. Rather than relying on a single docking engine's scoring function, we combine results from multiple engines to improve prediction reliability.

#### 2.4.1 Mathematical Formulation

For a ligand *L* docked against receptor *R*, each engine *e* produces a set of binding poses *P_e* with associated scores *S_e*. The consensus score is computed as:

**Score Normalization:**

Each engine's scores are normalized to Z-scores to account for different scoring function scales:

```
Z_e = (S_e - μ_e) / σ_e
```

Where:
- *S_e* = Raw score from engine *e*
- *μ_e* = Mean score across all poses from engine *e*
- *σ_e* = Standard deviation of scores from engine *e*

**Consensus Computation:**

The final consensus score combines normalized scores using exponential weighting:

```
Consensus = Σ(w_e × Z_e) / Σ(w_e)
```

Where weights *w_e* are derived from engine reliability metrics (default: equal weights).

#### 2.4.2 Rank Aggregation

For virtual screening, pose rankings are aggregated using Borda count:

```
Rank_consensus(L) = Σ(N - Rank_e(L))
```

Where *N* is the total number of ligands and *Rank_e(L)* is the rank of ligand *L* by engine *e*.

#### 2.4.3 Implementation

```typescript
interface ConsensusResult {
  ligandId: string;
  vinaScore: number;
  sminaScore: number;
  vinaZScore: number;
  sminaZScore: number;
  consensusScore: number;
  consensusRank: number;
}

function computeConsensus(
  vinaResults: DockingResult[],
  sminaResults: DockingResult[]
): ConsensusResult[] {
  // Calculate Z-scores for each engine
  const vinaZ = zScoreNormalize(vinaResults.map(r => r.score));
  const sminaZ = zScoreNormalize(sminaResults.map(r => r.score));
  
  // Combine with equal weights
  return vinaResults.map((v, i) => ({
    ligandId: v.ligandId,
    vinaScore: v.score,
    sminaScore: sminaResults[i].score,
    vinaZScore: vinaZ[i],
    sminaZScore: sminaZ[i],
    consensusScore: (vinaZ[i] + sminaZ[i]) / 2,
    consensusRank: 0  // Computed after sorting
  }));
}
```

### 2.5 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Environment                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   React UI  │───▶│  Dexie.js   │───▶│     IndexedDB       │  │
│  │  Components │◀───│   (ORM)     │◀───│  (Local Storage)    │  │
│  └──────┬──────┘    └─────────────┘    └─────────────────────┘  │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Parallel Web Worker Threads                     ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐    ││
│  │  │  Vina WASM   │  │  SMINA WASM  │  │  Consensus     │    ││
│  │  │  Worker #1   │  │  Worker #2   │  │  Aggregator    │    ││
│  │  └──────────────┘  └──────────────┘  └────────────────┘    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ ZERO DATA EGRESS
                              ▼
                    ┌───────────────────┐
                    │   External APIs   │
                    │  (PubChem, RCSB)  │
                    │   Read-Only       │
                    └───────────────────┘
```

### 2.6 External API Integration

SimDock Pro integrates with external databases for structure retrieval while maintaining zero-egress principles:

- **RCSB PDB**: Receptor structure downloads (read-only)
- **PubChem**: Ligand structure and property queries (read-only)
- **3Dmol.js**: Client-side visualization (no data transmission)

All uploaded user structures remain exclusively in local IndexedDB storage.

### 2.7 Privacy and Security Considerations

| Aspect | Implementation |
|--------|---------------|
| Data Storage | IndexedDB (browser sandbox) |
| Data Transmission | None (zero server communication) |
| Session Persistence | LocalStorage for preferences only |
| Export | User-initiated file download only |
| Multi-device Sync | Not supported (by design) |
| Security Headers | COOP/COEP for SharedArrayBuffer isolation |

This architecture intentionally trades multi-device synchronization for absolute data privacy, making SimDock Pro suitable for confidential pharmaceutical research where proprietary compounds must not leave organizational boundaries.

---

## Notes for Final Paper

> **Figure 2.4 TODO**: Create a proper diagram showing Vina and SMINA running in parallel Web Workers with message passing to the consensus aggregator.

> **Table 1 Enhancement**: Run native C++ Vina benchmark on same hardware to get actual overhead percentage rather than estimated values.
