from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import requests
import traceback

router = APIRouter()

class QueryRequest(BaseModel):
    query: str
    target_protein: Optional[str] = None
    ligand_smiles: Optional[str] = None
    use_raw_gemma: Optional[bool] = False

class QueryResponse(BaseModel):
    recommendation: str
    reasoning_steps: List[str]
    tools_used: List[str]
    mode: str

def check_ollama_running(url="http://localhost:11434/api/tags") -> bool:
    """Check if local Ollama server is running."""
    try:
        res = requests.get(url, timeout=2)
        return res.status_code == 200
    except:
        return False

def setup_ollama_aliases():
    """Create aliases in Ollama for models commonly requested by agent frameworks like TxAgent."""
    if not check_ollama_running():
        return
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=2)
        if res.status_code == 200:
            models = [m.get("name") for m in res.json().get("models", [])]
            # Find a local gemma model to copy from
            gemma_models = [m for m in models if "gemma" in m]
            base_model = gemma_models[0] if gemma_models else (models[0] if models else None)
            
            if base_model:
                for target_alias in ["gpt-4o", "gpt-3.5-turbo", "gpt-4", "mims-harvard/TxAgent-T1-Llama-3.1-8B"]:
                    # check if the alias already exists (either exact match or with tag)
                    if not any(target_alias in m for m in models):
                        print(f"Creating Ollama alias: {base_model} -> {target_alias}")
                        import subprocess
                        subprocess.run(["ollama", "cp", base_model, target_alias], 
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"Warning: Failed to setup Ollama aliases: {e}")

def query_ollama_api(prompt: str, default_model: str = "gemma2:2b") -> str:
    """Helper to query local Ollama server."""
    url = "http://localhost:11434/api/generate"
    model_id = default_model
    
    # Try to find a gemma model pulled in Ollama dynamically
    try:
        tags_res = requests.get("http://localhost:11434/api/tags", timeout=2)
        if tags_res.status_code == 200:
            models = [m.get("name") for m in tags_res.json().get("models", [])]
            gemma_models = [m for m in models if "gemma" in m]
            if gemma_models:
                model_id = gemma_models[0]
            elif models:
                model_id = models[0]
    except:
        pass

    payload = {
        "model": model_id,
        "prompt": prompt,
        "stream": False
    }
    response = requests.post(url, json=payload, timeout=90)
    if response.status_code == 200:
        return response.json().get("response", "").strip()
    else:
        raise Exception(f"Ollama returned {response.status_code}: {response.text}")

def query_gemma_api(prompt: str, hf_token: str, model_id: str = "google/gemma-2-9b-it") -> str:
    """Helper to query Hugging Face Serverless Inference API for Gemma directly."""
    api_url = f"https://api-inference.huggingface.co/models/{model_id}"
    headers = {"Authorization": f"Bearer {hf_token}"}
    payload = {
        "inputs": f"<start_of_turn>user\n{prompt}<end_of_turn>\n<start_of_turn>model\n",
        "parameters": {
            "max_new_tokens": 1024,
            "temperature": 0.7,
            "return_full_text": False
        }
    }
    response = requests.post(api_url, headers=headers, json=payload, timeout=60)
    if response.status_code == 200:
        res = response.json()
        if isinstance(res, list) and len(res) > 0:
            return res[0].get("generated_text", "").strip()
        elif isinstance(res, dict) and "generated_text" in res:
            return res["generated_text"].strip()
        return str(res)
    else:
        raise Exception(f"Hugging Face API returned {response.status_code}: {response.text}")

@router.post("/query", response_model=QueryResponse)
def run_therapeutic_query(request: QueryRequest):
    """
    Runs the AI Copilot query.
    If 'use_raw_gemma' is True or 'txagent' is not installed:
      1. Tries to query local Ollama server if running.
      2. Falls back to querying the Hugging Face Serverless API with Gemma.
    """
    hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_KEY")
    
    # 1. Check if we should use direct Gemma API fallback
    use_fallback = request.use_raw_gemma
    tx_agent_class = None
    
    if not use_fallback:
        try:
            from txagent import TxAgent
            tx_agent_class = TxAgent
        except ImportError:
            use_fallback = True

    # 2. Build prompt context
    context = []
    if request.target_protein:
        context.append(f"- Target Protein/Receptor: {request.target_protein}")
    if request.ligand_smiles:
        context.append(f"- Ligand SMILES/Structure: {request.ligand_smiles}")
    
    context_str = "\n".join(context)
    
    # 3. Execution Path
    if use_fallback:
        prompt = request.query
        if context_str:
            prompt = f"Context:\n{context_str}\n\nQuestion: {prompt}\n\nProvide a detailed therapeutic analysis and list potential drug interactions or contraindications."
        
        # Path A: Try Local Ollama if active
        if check_ollama_running():
            try:
                answer = query_ollama_api(prompt)
                return QueryResponse(
                    recommendation=answer,
                    reasoning_steps=["Direct query to local Ollama server."],
                    tools_used=[],
                    mode="Ollama (Local Gemma)"
                )
            except Exception as e:
                traceback.print_exc()
                if not hf_token:
                    raise HTTPException(status_code=500, detail=f"Local Ollama failed: {str(e)}")
        
        # Path B: Hugging Face Serverless fallback
        if not hf_token:
            raise HTTPException(
                status_code=400,
                detail="Neither TxAgent is installed, local Ollama is running, nor HF_TOKEN is configured. Please start Ollama or set HF_TOKEN."
            )
        
        try:
            answer = query_gemma_api(prompt, hf_token)
            return QueryResponse(
                recommendation=answer,
                reasoning_steps=["Direct query to Hugging Face Inference API."],
                tools_used=[],
                mode="Gemma API Direct"
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Gemma API failed: {str(e)}")
            
    else:
        try:
            # Force TxAgent to use local Ollama (Gemma) if running
            if check_ollama_running():
                os.environ["OPENAI_BASE_URL"] = "http://localhost:11434/v1"
                os.environ["OPENAI_API_KEY"] = "ollama"
                setup_ollama_aliases()

            # Run using the local TxAgent and ToolUniverse
            agent = tx_agent_class()
            
            full_query = request.query
            if context_str:
                full_query = f"{context_str}\n\nQuery: {full_query}"
                
            result = agent.run(query=full_query)
            
            return QueryResponse(
                recommendation=result.get("answer", "No answer returned by TxAgent."),
                reasoning_steps=result.get("reasoning_trace", ["Agent reasoning completed."]),
                tools_used=result.get("executed_tools", []),
                mode="TxAgent + ToolUniverse"
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"TxAgent failed: {str(e)}")
