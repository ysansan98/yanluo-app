import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

MODEL = None
MODEL_LOAD_ERROR = None
MODEL_RUNTIME = {}

MODEL_NAME = os.getenv("ASR_MODEL_NAME", "Qwen/Qwen3-ASR-0.6B")
MODEL_DIR = os.getenv("ASR_MODEL_DIR")
ALLOW_DOWNLOAD = os.getenv("ASR_ALLOW_DOWNLOAD", "0") == "1"
DEVICE = os.getenv("ASR_DEVICE")  # e.g. "cuda:0", "mps", "cpu"
DTYPE = os.getenv("ASR_DTYPE")  # e.g. "bfloat16", "float16", "float32"


class TranscribeFileRequest(BaseModel):
    path: str
    language: Optional[str] = None


def _resolve_model_id() -> str:
    if MODEL_DIR and os.path.isdir(MODEL_DIR):
        return MODEL_DIR
    if ALLOW_DOWNLOAD:
        return MODEL_NAME
    raise RuntimeError(
        "Model not found. Set ASR_MODEL_DIR to a valid local model folder "
        "or set ASR_ALLOW_DOWNLOAD=1 to allow automatic download."
    )


def _load_model():
    global MODEL, MODEL_LOAD_ERROR, MODEL_RUNTIME
    if MODEL is not None or MODEL_LOAD_ERROR is not None:
        return

    try:
        import torch
        from qwen_asr import Qwen3ASRModel

        model_id = _resolve_model_id()

        requested_dtype = torch.float32
        if DTYPE == "float16":
            requested_dtype = torch.float16
        elif DTYPE == "bfloat16":
            requested_dtype = torch.bfloat16

        requested_device = DEVICE
        if not requested_device:
            if torch.cuda.is_available():
                requested_device = "cuda:0"
            else:
                requested_device = "cpu"

        def _build_model(device_map, dtype):
            return Qwen3ASRModel.from_pretrained(
                model_id,
                dtype=dtype,
                device_map=device_map,
                max_inference_batch_size=4,
                max_new_tokens=1024,
            )

        try:
            MODEL = _build_model(requested_device, requested_dtype)
            MODEL_RUNTIME = {
                "device": requested_device,
                "dtype": str(requested_dtype),
                "fallback": False,
            }
        except Exception as first_exc:
            msg = str(first_exc).lower()
            # Apple Silicon / accelerate can fail with meta tensor errors.
            if "meta tensor" in msg or "cannot copy out of meta tensor" in msg:
                MODEL = _build_model("cpu", torch.float32)
                MODEL_RUNTIME = {
                    "device": "cpu",
                    "dtype": str(torch.float32),
                    "fallback": True,
                    "fallback_reason": str(first_exc),
                }
            else:
                raise
    except Exception as exc:
        MODEL_LOAD_ERROR = exc


def _reload_model_cpu_fallback(reason: str):
    global MODEL, MODEL_LOAD_ERROR, MODEL_RUNTIME
    import torch
    from qwen_asr import Qwen3ASRModel

    model_id = _resolve_model_id()
    MODEL = Qwen3ASRModel.from_pretrained(
        model_id,
        dtype=torch.float32,
        device_map="cpu",
        max_inference_batch_size=2,
        max_new_tokens=1024,
    )
    MODEL_LOAD_ERROR = None
    MODEL_RUNTIME = {
        "device": "cpu",
        "dtype": str(torch.float32),
        "fallback": True,
        "fallback_reason": reason,
    }


@app.get("/health")
def health():
    _load_model()
    return {
        "status": "ok",
        "model_loaded": MODEL is not None,
        "model_error": str(MODEL_LOAD_ERROR) if MODEL_LOAD_ERROR else None,
        "runtime": MODEL_RUNTIME,
    }


@app.post("/asr/file")
def transcribe_file(req: TranscribeFileRequest):
    if not os.path.isfile(req.path):
        raise HTTPException(status_code=400, detail="Audio file not found")

    _load_model()
    if MODEL_LOAD_ERROR:
        raise HTTPException(status_code=500, detail=str(MODEL_LOAD_ERROR))
    if MODEL is None:
        raise HTTPException(status_code=500, detail="Model failed to load")

    started_at = time.perf_counter()
    try:
        results = MODEL.transcribe(audio=req.path, language=req.language)
    except Exception as transcribe_exc:
        msg = str(transcribe_exc).lower()
        if "meta tensor" in msg or "cannot copy out of meta tensor" in msg:
            try:
                _reload_model_cpu_fallback(str(transcribe_exc))
                results = MODEL.transcribe(audio=req.path, language=req.language)
            except Exception as fallback_exc:
                raise HTTPException(status_code=500, detail=str(fallback_exc)) from fallback_exc
        else:
            raise HTTPException(status_code=500, detail=str(transcribe_exc)) from transcribe_exc

    if not results:
        raise HTTPException(status_code=500, detail="Empty ASR result")

    r = results[0]
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        "text": r.text,
        "language": r.language,
        "elapsed_ms": elapsed_ms,
    }
