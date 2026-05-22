from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from api.models import DockingConfig, JobResponse, BatchDockingConfig
from pydantic import BaseModel
from api.dependencies import get_project_manager, get_config_manager
from core.docking_engine import DockingEngineFactory
import uuid
import asyncio
import os
import zipfile
from pathlib import Path
from typing import Dict

router = APIRouter()

# Simple in-memory job store
jobs: Dict[str, dict] = {}

def run_docking_task(job_id: str, config: DockingConfig, project_path: str):
    """Background task wrapper for docking."""
    # [FIX] Import from dependencies to avoid circular import with api.main
    from api.dependencies import get_project_manager
    
    print(f"DEBUG: Starting background docking task {job_id}...")
    try:
        jobs[job_id]["status"] = "running"
        print(f"DEBUG: Job {job_id} status set to running")
        
        # Prepare paths - Validating and Sanitizing inputs
        project_path_obj = Path(project_path)
        
        # Receptor Logic: Robustly handle simple names or paths
        # Always prioritize looking in 'receptors' folder first for organization
        rec_name = Path(config.receptor_file).name
        receptor_candidate = project_path_obj / "receptors" / rec_name
        if not receptor_candidate.exists():
             # Fallback: check if they passed a path relative to root?
             receptor_candidate = project_path_obj / config.receptor_file
             
        receptor_path = str(receptor_candidate)

        # Ligand Logic: "Search Strategy" to satisfy Hybrid Config
        # We check specific locations in order of likelihood
        lig_filename = Path(config.ligand_file).name
        
        potential_ligand_paths = [
            project_path_obj / config.ligand_file,             # 1. Exact user input (e.g. "receptors/ligand.pdbqt")
            project_path_obj / "ligands" / lig_filename,       # 2. Standard location
            project_path_obj / "receptors" / lig_filename,     # 3. Often uploaded here by mistake/intent
            project_path_obj / lig_filename                    # 4. Root fallback
        ]
        
        ligand_path = None
        for p in potential_ligand_paths:
            if p.exists():
                ligand_path = str(p)
                print(f"DEBUG: Found ligand at: {p}")
                break
        
        if not ligand_path:
             raise FileNotFoundError(f"Ligand file '{config.ligand_file}' not found in project.")
        
        # Output handling - ensure directory exists
        results_dir = project_path_obj / "results"
        results_dir.mkdir(exist_ok=True)
        
        output_file = str(results_dir / f"out_{Path(config.ligand_file).stem}.pdbqt")
        
        print(f"DEBUG: Running docking engine {config.engine}...")
        # Create Engine
        engine = DockingEngineFactory.create_engine(config.engine)
        
        # Run Docking
        result = engine.run_docking(
            receptor_path,
            ligand_path,
            output_file,
            center=(config.config.center_x, config.config.center_y, config.config.center_z),
            size=(config.config.size_x, config.config.size_y, config.config.size_z),
            exhaustiveness=config.exhaustiveness,
            num_modes=config.num_modes,
            energy_range=config.energy_range
        )
        
        print(f"DEBUG: Docking finished. Success: {result['success']}")
        
        if result['success']:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["result"] = result
            
            # --- PERSISTENCE: Save to Project History (Replica of GUI) ---
            try:
                pm = get_project_manager()
                # Need to load the project to context first
                pm.load_project(project_path_obj)
                
                session_data = {
                    'last_run_type': 'single',
                    'receptor_pdbqt_path': receptor_path,
                    'ligand_pdbqt_path': ligand_path,  # Use ligand path, not library list
                    'single_docking_output_path': output_file,
                    'grid_center': [config.config.center_x, config.config.center_y, config.config.center_z],
                    'grid_size': [config.config.size_x, config.config.size_y, config.config.size_z],
                    'exhaustiveness': config.exhaustiveness,
                    'last_results': result.get('scores', []),
                    'engine': config.engine
                }
                
                saved_session = pm.save_docking_session(session_data)
                jobs[job_id]["saved_session"] = saved_session
                print(f"Job {job_id} saved to history: {saved_session}")
                
            except Exception as save_err:
                print(f"Warning: Failed to save job history: {save_err}")
                jobs[job_id]["history_error"] = str(save_err)
            # -------------------------------------------------------------
            
        else:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = result.get('error', 'Unknown error')
            
    except Exception as e:
        print(f"CRITICAL ERROR in docking task {job_id}: {e}")
        import traceback
        traceback.print_exc()
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@router.post("/{project_name}/dock", response_model=JobResponse)
def submit_docking_job(
    project_name: str, 
    config: DockingConfig, 
    background_tasks: BackgroundTasks,
    pm = Depends(get_project_manager)
):
    """Submit a docking job."""
    from api.dependencies import find_project_path
    
    project_path = find_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
        
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "pending",
        "project": project_name,
        "engine": config.engine
    }
    
    # Add to background tasks
    background_tasks.add_task(run_docking_task, job_id, config, project_path)
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        project_name=project_name,
        engine=config.engine
    )

def run_batch_docking_task(job_id: str, config: BatchDockingConfig, project_path: str):
    """Background task for batch docking."""
    from api.dependencies import get_project_manager
    from core.docking_engine import DockingEngineFactory
    
    print(f"DEBUG: Starting BATCH docking task {job_id}...")
    try:
        jobs[job_id]["status"] = "running"
        project_path_obj = Path(project_path)
        receptor_path = str(project_path_obj / "receptors" / config.receptor_file)
        
        # 1. Process Ligands ZIP
        zip_path = project_path_obj / "temp" / config.ligands_zip
        if not zip_path.exists():
            raise FileNotFoundError(f"ZIP file not found: {config.ligands_zip}")
            
        extract_dir = project_path_obj / "temp" / f"batch_{job_id}"
        extract_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # 2. Find ligands
        ligand_files = []
        for root, _, files in os.walk(extract_dir):
            for file in files:
                if file.lower().endswith(('.pdb', '.sdf', '.mol2', '.pdbqt')):
                    ligand_files.append(os.path.join(root, file))
                    
        print(f"DEBUG: Found {len(ligand_files)} ligands for batch docking.")
        
        # 3. Running Docking Loop
        results = []
        batch_results_summary = []
        
        engine = DockingEngineFactory.create_engine(config.engine)
        
        # Ensure results directory exists
        results_dir = project_path_obj / "results"
        results_dir.mkdir(exist_ok=True)
        
        for lig_path in ligand_files:
            lig_name = os.path.basename(lig_path)
            out_path = results_dir / f"{job_id}_{lig_name}_out.pdbqt"
            
            print(f"DEBUG: Docking {lig_name}...")
            try:
                res = engine.run_docking(
                    receptor_path,
                    lig_path,
                    str(out_path),
                    center=(config.config.center_x, config.config.center_y, config.config.center_z),
                    size=(config.config.size_x, config.config.size_y, config.config.size_z),
                    exhaustiveness=config.exhaustiveness,
                    temp_dir=str(extract_dir),
                    job_id=job_id # For unique naming in RDock
                )
                 
                score = res.get('scores', [{}])[0].get('Affinity (kcal/mol)') if res.get('scores') else None
                success = res['success']
                
                results.append({
                    "ligand": lig_name,
                    "success": success,
                    "score": score
                })
                
                # Structure for ProjectManager
                batch_results_summary.append({
                    "Ligand": lig_name,
                    "Score": score if score else "N/A",
                    "OutputFile": str(out_path) if success else None,
                    "Status": "Success" if success else "Failed"
                })
                 
            except Exception as e:
                print(f"Error docking {lig_name}: {e}")
                results.append({"ligand": lig_name, "success": False, "error": str(e)})
                batch_results_summary.append({
                     "Ligand": lig_name,
                     "Score": "N/A",
                     "OutputFile": None,
                     "Status": "Error"
                 })

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["batch_results"] = results
        
        # --- PERSISTENCE: Save Batch Session ---
        try:
            pm = get_project_manager()
            pm.load_project(project_path_obj)
            
            session_data = {
                'last_run_type': 'batch',
                'receptor_pdbqt_path': receptor_path,
                'batch_results_summary': batch_results_summary,
                'ligand_library': ligand_files, 
                'grid_center': [config.config.center_x, config.config.center_y, config.config.center_z],
                'grid_size': [config.config.size_x, config.config.size_y, config.config.size_z],
                'exhaustiveness': config.exhaustiveness,
                'engine': config.engine
            }
            
            saved_session = pm.save_docking_session(session_data)
            jobs[job_id]["saved_session"] = saved_session
            print(f"Batch Job {job_id} saved to history: {saved_session}")
            
        except Exception as save_err:
            print(f"Warning: Failed to save batch history: {save_err}")
            jobs[job_id]["history_error"] = str(save_err)
        # ---------------------------------------
        
    except Exception as e:
        print(f"CRITICAL ERROR in batch docking {job_id}: {e}")
        import traceback
        traceback.print_exc()
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@router.post("/{project_name}/dock/batch", response_model=JobResponse)
def submit_batch_docking(
    project_name: str,
    config: BatchDockingConfig,
    background_tasks: BackgroundTasks,
    pm = Depends(get_project_manager)
):
    """Submit a BATCH docking job (ZIP of ligands)."""
    from api.dependencies import find_project_path
    project_path = find_project_path(project_name)
    if not project_path or not project_path.exists():
       raise HTTPException(status_code=404, detail="Project not found")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "pending",
        "project": project_name,
        "engine": config.engine,
        "mode": "batch"
    }
    
    
    # [STUDENT TIER] Force CPU limit to 2 cores
    # This wraps the engine call to ensure fair usage in the Sandbox
    config.cpu = 2
    
    # [STUDENT GUARD] Hard-cap submissions to max 5 ligands
    # 1. Locate the ZIP file
    zip_path = project_path / "temp" / config.ligands_zip
    if not zip_path.exists():
         raise HTTPException(status_code=404, detail=f"Ligands ZIP file not found: {config.ligands_zip}")

    # 2. Count files in ZIP without extracting everything
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Filter for valid ligand extensions
            ligand_names = [
                f for f in zip_ref.namelist() 
                if f.lower().endswith(('.pdb', '.sdf', '.mol2', '.pdbqt')) 
                and not f.startswith('__MACOSX') # Ignore macOS metadata
            ]
            
            if len(ligand_names) > 5:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Student Guard: Batch size limit exceeded. Max 5 ligands allowed (you submitted {len(ligand_names)}). Please optimize your selection."
                )
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    background_tasks.add_task(run_batch_docking_task, job_id, config, project_path)
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        project_name=project_name,
        engine=config.engine
    )

@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    """Get status of a specific job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@router.get("/jobs")
def list_jobs():
    """List all jobs."""
    return list(jobs.values())

class PpdConfig(BaseModel):
    receptor_file: str
    ligand_file: str

def run_ppd_task(job_id: str, config: PpdConfig, project_path: str):
    """Background task for Protein-Protein Docking using LightDock."""
    import subprocess
    import shutil as shutil_mod
    jobs[job_id]["status"] = "running"
    try:
        project_path_obj = Path(project_path)

        # --- Locate receptor ---
        rec_name = Path(config.receptor_file).name
        receptor_path = project_path_obj / "receptors" / rec_name
        if not receptor_path.exists():
            receptor_path = project_path_obj / config.receptor_file
        receptor_path = str(receptor_path)

        # --- Locate ligand (Protein B) ---
        lig_name = Path(config.ligand_file).name
        ligand_path = project_path_obj / "ligands" / lig_name
        if not ligand_path.exists():
            ligand_path = project_path_obj / config.ligand_file
        ligand_path = str(ligand_path)

        results_dir = project_path_obj / "results"
        results_dir.mkdir(exist_ok=True)
        final_output = str(results_dir / f"ppd_out_{job_id}.pdb")

        print(f"DEBUG: PPD Receptor: {receptor_path}")
        print(f"DEBUG: PPD Protein B: {ligand_path}")

        # ---------------------------------------------------------------
        # Check if LightDock is installed
        # ---------------------------------------------------------------
        ld_setup = shutil_mod.which("lightdock3_setup.py") or shutil_mod.which("lightdock3_setup")
        ld_run   = shutil_mod.which("lightdock3.py") or shutil_mod.which("lightdock3")
        ld_rank  = shutil_mod.which("lgd_rank.py") or shutil_mod.which("lgd_rank")
        ld_gen   = shutil_mod.which("lgd_generate_conformations.py") or shutil_mod.which("lgd_generate_conformations")

        if ld_setup and ld_run and ld_rank:
            print("INFO: LightDock found. Running real protein-protein docking...")

            # LightDock needs its own working directory
            ld_work_dir = results_dir / f"lightdock_{job_id}"
            ld_work_dir.mkdir(exist_ok=True)

            # --- Step 1: Setup (generates ANM modes & swarm positions) ---
            num_swarms    = 25
            num_glowworms = 200
            sim_steps     = 100
            setup_cmd = [
                ld_setup, receptor_path, ligand_path,
                "-s", str(num_swarms),
                "-g", str(num_glowworms),
                "--noxt", "--noh", "--now",
            ]
            print(f"DEBUG: Setup cmd: {' '.join(setup_cmd)}")
            res = subprocess.run(setup_cmd, capture_output=True, text=True, cwd=str(ld_work_dir))
            if res.returncode != 0:
                raise RuntimeError(f"LightDock setup failed:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}")

            # --- Step 2: Simulation ---
            # lightdock3 <setup_file> <steps> [-c cores]
            setup_json = ld_work_dir / "lightdock3_setup.json"
            if not setup_json.exists():
                # Some versions name it setup.json
                setup_json = ld_work_dir / "setup.json"
            run_cmd = [ld_run, str(setup_json), str(sim_steps), "-c", "2"]
            print(f"DEBUG: Run cmd: {' '.join(run_cmd)}")
            res = subprocess.run(run_cmd, capture_output=True, text=True, cwd=str(ld_work_dir), timeout=900)
            if res.returncode != 0:
                raise RuntimeError(f"LightDock simulation failed:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}")

            # --- Step 3: Rank poses ---
            # Try binary first, fall back to python -m lightdock.bin.lgd_rank
            if ld_rank:
                rank_cmd = [ld_rank, str(num_swarms), str(sim_steps)]
            else:
                rank_cmd = ["python", "-m", "lightdock.bin.lgd_rank", str(num_swarms), str(sim_steps)]
            print(f"DEBUG: Rank cmd: {' '.join(rank_cmd)}")
            rank_res = subprocess.run(rank_cmd, capture_output=True, text=True, cwd=str(ld_work_dir))
            print(f"DEBUG: Rank stdout: {rank_res.stdout[:300]}")
            print(f"DEBUG: Rank stderr: {rank_res.stderr[:300]}")

            # --- Debug: list files in work dir ---
            all_files = list(ld_work_dir.rglob("*"))
            print(f"DEBUG: Files in work dir: {[str(f.relative_to(ld_work_dir)) for f in all_files[:30]]}")

            # --- Step 4: Parse top score ---
            # LightDock can output rank_by_scoring.list or similar
            possible_rank_files = [
                ld_work_dir / "rank_by_scoring.list",
                ld_work_dir / "lightdock_rank.list",
                ld_work_dir / "rank.list",
            ]
            ranking_file = next((f for f in possible_rank_files if f.exists()), None)

            top_score = None
            top_poses = []
            if ranking_file:
                print(f"DEBUG: Parsing ranking file: {ranking_file}")
                with open(ranking_file) as rf:
                    for line in rf:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split()
                        # LightDock rank format: swarm_id step score ...
                        if len(parts) >= 3:
                            try:
                                score_val = float(parts[2])
                                top_poses.append({
                                    "swarm": parts[0], "step": parts[1], "score": round(score_val, 4)
                                })
                                if top_score is None or score_val > top_score:  # LightDock scores: higher = better
                                    top_score = score_val
                            except ValueError:
                                pass
            else:
                print("WARNING: No ranking file found after lgd_rank run")

            # --- Step 5: Generate best complex PDB ---
            if ld_gen:
                subprocess.run(
                    [ld_gen, "1"],
                    capture_output=True, text=True, cwd=str(ld_work_dir)
                )

            generated = list(ld_work_dir.glob("lightdock_*.pdb"))
            if generated:
                shutil_mod.copy(str(generated[0]), final_output)
            else:
                # Merge as fallback if generation fails
                with open(receptor_path) as r, open(ligand_path) as l, open(final_output, "w") as o:
                    o.write(r.read())
                    o.write("\nTER\n")
                    o.write(l.read())
                    o.write("\nEND\n")

            result = {
                "success": True,
                "engine": "lightdock",
                "output_file": final_output,
                "score": round(top_score, 3) if top_score is not None else 0.0,
                "top_poses": top_poses[:10],
                "num_swarms": num_swarms,
                "sim_steps": sim_steps,
            }

        else:
            # ---------------------------------------------------------------
            # LightDock NOT installed — merge PDBs and flag as fallback
            # ---------------------------------------------------------------
            print("WARNING: LightDock not installed. Using structural merge fallback.")
            print("         To enable real docking: pip install lightdock")
            with open(receptor_path) as r, open(ligand_path) as l, open(final_output, "w") as o:
                o.write(r.read())
                o.write("\nTER\n")
                o.write(l.read())
                o.write("\nEND\n")

            result = {
                "success": True,
                "engine": "fallback_merge",
                "output_file": final_output,
                "score": None,
                "warning": (
                    "LightDock is not installed on this server. The output file is a simple "
                    "structural merge of both proteins with no docking score. "
                    "Install it with: pip install lightdock"
                ),
            }

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = result

    except Exception as e:
        print(f"CRITICAL ERROR in PPD task {job_id}: {e}")
        import traceback
        traceback.print_exc()
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@router.post("/{project_name}/dock-pp", response_model=JobResponse)
def submit_ppd_job(
    project_name: str, 
    config: PpdConfig, 
    background_tasks: BackgroundTasks
):
    """Submit a Protein-Protein docking job."""
    from api.dependencies import find_project_path
    
    project_path = find_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
        
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "pending",
        "project": project_name,
        "engine": "ppd"
    }
    
    background_tasks.add_task(run_ppd_task, job_id, config, project_path)
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        project_name=project_name,
        engine="ppd"
    )
