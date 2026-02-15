import asyncio
import base64
import os
import tempfile
import threading
import time
import wave
from dataclasses import dataclass
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

app = FastAPI()

MODEL = None
MODEL_LOAD_ERROR = None
MODEL_RUNTIME = {}
MODEL_INFER_LOCK = threading.Lock()

MODEL_NAME = os.getenv('ASR_MODEL_NAME', 'Qwen/Qwen3-ASR-0.6B')
MODEL_DIR = os.getenv('ASR_MODEL_DIR')
ALLOW_DOWNLOAD = os.getenv('ASR_ALLOW_DOWNLOAD', '0') == '1'
DEVICE = os.getenv('ASR_DEVICE')  # e.g. "cuda:0", "mps", "cpu"
DTYPE = os.getenv('ASR_DTYPE')  # e.g. "bfloat16", "float16", "float32"

STREAM_SAMPLE_RATE = 16000
STREAM_PARTIAL_MIN_SAMPLES = int(os.getenv('ASR_STREAM_PARTIAL_MIN_SAMPLES', '16000'))
STREAM_PARTIAL_MIN_INTERVAL_MS = int(os.getenv('ASR_STREAM_PARTIAL_MIN_INTERVAL_MS', '900'))


class TranscribeFileRequest(BaseModel):
    path: str
    language: Optional[str] = None


@dataclass
class StreamingSession:
    session_id: str
    sample_rate: int
    language: Optional[str]
    pcm16le: bytearray
    last_partial_samples: int
    last_partial_emit_ms: int
    last_partial_text: str
    transcribing: bool


def _resolve_model_id() -> str:
    if MODEL_DIR and os.path.isdir(MODEL_DIR):
        return MODEL_DIR
    if ALLOW_DOWNLOAD:
        return MODEL_NAME
    raise RuntimeError(
        'Model not found. Set ASR_MODEL_DIR to a valid local model folder '
        'or set ASR_ALLOW_DOWNLOAD=1 to allow automatic download.'
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
        if DTYPE == 'float16':
            requested_dtype = torch.float16
        elif DTYPE == 'bfloat16':
            requested_dtype = torch.bfloat16

        requested_device = DEVICE
        if not requested_device:
            if torch.cuda.is_available():
                requested_device = 'cuda:0'
            else:
                requested_device = 'cpu'

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
                'device': requested_device,
                'dtype': str(requested_dtype),
                'fallback': False,
            }
        except Exception as first_exc:
            msg = str(first_exc).lower()
            # Apple Silicon / accelerate can fail with meta tensor errors.
            if 'meta tensor' in msg or 'cannot copy out of meta tensor' in msg:
                MODEL = _build_model('cpu', torch.float32)
                MODEL_RUNTIME = {
                    'device': 'cpu',
                    'dtype': str(torch.float32),
                    'fallback': True,
                    'fallback_reason': str(first_exc),
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
        device_map='cpu',
        max_inference_batch_size=2,
        max_new_tokens=1024,
    )
    MODEL_LOAD_ERROR = None
    MODEL_RUNTIME = {
        'device': 'cpu',
        'dtype': str(torch.float32),
        'fallback': True,
        'fallback_reason': reason,
    }


def _ensure_model_ready() -> None:
    _load_model()
    if MODEL_LOAD_ERROR:
        raise RuntimeError(str(MODEL_LOAD_ERROR))
    if MODEL is None:
        raise RuntimeError('Model failed to load')


def _run_transcribe(audio_path: str, language: Optional[str]):
    with MODEL_INFER_LOCK:
        try:
            return MODEL.transcribe(audio=audio_path, language=language)
        except Exception as transcribe_exc:
            msg = str(transcribe_exc).lower()
            if 'meta tensor' in msg or 'cannot copy out of meta tensor' in msg:
                _reload_model_cpu_fallback(str(transcribe_exc))
                return MODEL.transcribe(audio=audio_path, language=language)
            raise


def _transcribe_pcm16le_bytes(pcm16le: bytes, language: Optional[str]):
    if not pcm16le:
        return {'text': '', 'language': language or ''}

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as fp:
        wav_path = fp.name

    try:
        with wave.open(wav_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(STREAM_SAMPLE_RATE)
            wav_file.writeframes(pcm16le)

        results = _run_transcribe(wav_path, language)
        if not results:
            return {'text': '', 'language': language or ''}

        result = results[0]
        return {
            'text': result.text or '',
            'language': result.language or (language or ''),
        }
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def _build_stream_error(session_id: Optional[str], code: str, message: str):
    return {
        'type': 'error',
        'sessionId': session_id,
        'code': code,
        'message': message,
    }


def _decode_audio_payload(payload: str) -> bytes:
    if not payload:
        return b''
    return base64.b64decode(payload)


@app.get('/health')
def health():
    _load_model()
    return {
        'status': 'ok',
        'model_loaded': MODEL is not None,
        'model_error': str(MODEL_LOAD_ERROR) if MODEL_LOAD_ERROR else None,
        'runtime': MODEL_RUNTIME,
    }


@app.post('/asr/file')
def transcribe_file(req: TranscribeFileRequest):
    if not os.path.isfile(req.path):
        raise HTTPException(status_code=400, detail='Audio file not found')

    try:
        _ensure_model_ready()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    started_at = time.perf_counter()
    try:
        results = _run_transcribe(req.path, req.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not results:
        raise HTTPException(status_code=500, detail='Empty ASR result')

    r = results[0]
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        'text': r.text,
        'language': r.language,
        'elapsed_ms': elapsed_ms,
    }


@app.websocket('/asr/stream')
async def stream_asr(websocket: WebSocket):
    await websocket.accept()
    sessions: dict[str, StreamingSession] = {}

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get('type')

            if msg_type == 'start':
                session_id = message.get('sessionId')
                language = message.get('language')
                sample_rate = int(message.get('sampleRate', STREAM_SAMPLE_RATE))

                if not session_id:
                    await websocket.send_json(
                        _build_stream_error(None, 'E_BAD_REQUEST', 'sessionId is required in start message')
                    )
                    continue

                if sample_rate != STREAM_SAMPLE_RATE:
                    await websocket.send_json(
                        _build_stream_error(
                            session_id,
                            'E_UNSUPPORTED_SAMPLE_RATE',
                            f'Only {STREAM_SAMPLE_RATE} Hz is supported',
                        )
                    )
                    continue

                try:
                    _ensure_model_ready()
                except Exception as exc:
                    await websocket.send_json(
                        _build_stream_error(session_id, 'E_ASR_CONNECT', str(exc))
                    )
                    continue

                sessions[session_id] = StreamingSession(
                    session_id=session_id,
                    sample_rate=sample_rate,
                    language=language,
                    pcm16le=bytearray(),
                    last_partial_samples=0,
                    last_partial_emit_ms=0,
                    last_partial_text='',
                    transcribing=False,
                )
                continue

            if msg_type == 'audio':
                session_id = message.get('sessionId')
                if not session_id or session_id not in sessions:
                    await websocket.send_json(
                        _build_stream_error(session_id, 'E_BAD_REQUEST', 'Unknown sessionId in audio message')
                    )
                    continue

                session = sessions[session_id]
                try:
                    audio_bytes = _decode_audio_payload(message.get('pcm16leBase64', ''))
                except Exception as exc:
                    await websocket.send_json(
                        _build_stream_error(session_id, 'E_BAD_AUDIO_PAYLOAD', str(exc))
                    )
                    continue

                if audio_bytes:
                    session.pcm16le.extend(audio_bytes)

                total_samples = len(session.pcm16le) // 2
                now_ms = int(time.time() * 1000)
                should_emit_partial = (
                    total_samples - session.last_partial_samples >= STREAM_PARTIAL_MIN_SAMPLES
                    and now_ms - session.last_partial_emit_ms >= STREAM_PARTIAL_MIN_INTERVAL_MS
                )

                if not should_emit_partial or session.transcribing:
                    continue

                try:
                    session.transcribing = True
                    partial = await asyncio.to_thread(
                        _transcribe_pcm16le_bytes,
                        bytes(session.pcm16le),
                        session.language,
                    )
                except Exception as exc:
                    await websocket.send_json(_build_stream_error(session_id, 'E_ASR_TRANSCRIBE', str(exc)))
                    session.transcribing = False
                    continue
                finally:
                    session.transcribing = False

                session.last_partial_samples = total_samples
                session.last_partial_emit_ms = now_ms
                if partial['text'] == session.last_partial_text:
                    continue

                session.last_partial_text = partial['text']
                await websocket.send_json(
                    {
                        'type': 'partial',
                        'sessionId': session_id,
                        'text': partial['text'],
                        'isFinal': False,
                    }
                )
                continue

            if msg_type == 'end':
                session_id = message.get('sessionId')
                if not session_id or session_id not in sessions:
                    await websocket.send_json(
                        _build_stream_error(session_id, 'E_BAD_REQUEST', 'Unknown sessionId in end message')
                    )
                    continue

                session = sessions.pop(session_id)
                if len(session.pcm16le) == 0:
                    await websocket.send_json(
                        _build_stream_error(session_id, 'E_EMPTY_RESULT', 'No audio data received for this session')
                    )
                    continue

                started_at = time.perf_counter()
                try:
                    final = await asyncio.to_thread(
                        _transcribe_pcm16le_bytes,
                        bytes(session.pcm16le),
                        session.language,
                    )
                except Exception as exc:
                    await websocket.send_json(_build_stream_error(session_id, 'E_ASR_TRANSCRIBE', str(exc)))
                    continue

                elapsed_ms = int((time.perf_counter() - started_at) * 1000)
                await websocket.send_json(
                    {
                        'type': 'final',
                        'sessionId': session_id,
                        'text': final['text'],
                        'isFinal': True,
                        'language': final['language'],
                        'elapsedMs': elapsed_ms,
                    }
                )
                continue

            await websocket.send_json(
                _build_stream_error(
                    message.get('sessionId'),
                    'E_BAD_REQUEST',
                    f'Unknown message type: {msg_type}',
                )
            )

    except WebSocketDisconnect:
        return
