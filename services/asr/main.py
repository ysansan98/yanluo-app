import asyncio
import base64
from math import gcd
import os
import re
import tempfile
import threading
import time
import wave
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

app = FastAPI()

MODEL = None
MODEL_LOAD_ERROR = None
MODEL_RUNTIME = {}
MODEL_INFER_LOCK = threading.Lock()

MODEL_NAME = os.getenv('ASR_MODEL_NAME', 'iic/SenseVoiceSmall-onnx')
MODEL_DIR = os.getenv('ASR_MODEL_DIR')
ALLOW_DOWNLOAD = os.getenv('ASR_ALLOW_DOWNLOAD', '0') == '1'

STREAM_SAMPLE_RATE = 16000
STREAM_PARTIAL_MIN_SAMPLES = int(os.getenv('ASR_STREAM_PARTIAL_MIN_SAMPLES', '12000'))
STREAM_PARTIAL_MIN_INTERVAL_MS = int(os.getenv('ASR_STREAM_PARTIAL_MIN_INTERVAL_MS', '500'))
STREAM_VAD_MIN_RMS = float(os.getenv('ASR_STREAM_VAD_MIN_RMS', '0.008'))
STREAM_VAD_MIN_ACTIVE_RATIO = float(os.getenv('ASR_STREAM_VAD_MIN_ACTIVE_RATIO', '0.015'))
STREAM_VAD_ACTIVE_ABS_THRESHOLD = float(os.getenv('ASR_STREAM_VAD_ACTIVE_ABS_THRESHOLD', '0.02'))
STREAM_VAD_MIN_AUDIO_MS = int(os.getenv('ASR_STREAM_VAD_MIN_AUDIO_MS', '300'))
STREAM_VAD_DEBUG = os.getenv('ASR_STREAM_VAD_DEBUG', '1') == '1'
SENSEVOICE_ONNX_TOKENIZER_FILE = 'chn_jpn_yue_eng_ko_spectok.bpe.model'


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


def _load_model_impl(model_id: str):
    is_local_dir = os.path.isdir(model_id)
    is_onnx_model = model_id.lower().endswith('-onnx') or (
        is_local_dir
        and (
            os.path.exists(os.path.join(model_id, 'model_quant.onnx'))
            or os.path.exists(os.path.join(model_id, 'model.onnx'))
        )
    )
    if not is_onnx_model:
        raise RuntimeError(
            'Only SenseVoiceSmall ONNX quantized model is supported. '
            f'Expected model repo/path like iic/SenseVoiceSmall-onnx, got: {model_id}'
        )

    try:
        from funasr_onnx import SenseVoiceSmall
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            'SenseVoice ONNX backend requires extra dependencies. '
            'Run: pip install funasr-onnx onnxruntime'
        ) from exc

    if is_local_dir:
        tokenizer_path = os.path.join(model_id, SENSEVOICE_ONNX_TOKENIZER_FILE)
        if not os.path.exists(tokenizer_path):
            try:
                from modelscope.hub.file_download import model_file_download

                model_file_download(
                    'iic/SenseVoiceSmall',
                    SENSEVOICE_ONNX_TOKENIZER_FILE,
                    local_dir=model_id,
                )
            except Exception as exc:
                raise RuntimeError(
                    'Failed to prepare SenseVoice ONNX tokenizer file. '
                    f'Missing {SENSEVOICE_ONNX_TOKENIZER_FILE}: {exc}'
                ) from exc

    model = SenseVoiceSmall(
        model_dir=model_id,
        quantize=True,
    )
    runtime = {
        'backend': 'sensevoice',
        'engine': 'funasr_onnx',
        'device': 'cpu',
        'dtype': 'int8',
    }
    return model, runtime


def _load_model():
    global MODEL, MODEL_LOAD_ERROR, MODEL_RUNTIME
    if MODEL is not None or MODEL_LOAD_ERROR is not None:
        return

    try:
        model_id = _resolve_model_id()
        MODEL, MODEL_RUNTIME = _load_model_impl(model_id)
    except Exception as exc:
        MODEL_LOAD_ERROR = exc


def _ensure_model_ready() -> None:
    _load_model()
    if MODEL_LOAD_ERROR:
        raise RuntimeError(str(MODEL_LOAD_ERROR))
    if MODEL is None:
        raise RuntimeError('Model failed to load')


def _sensevoice_language(language: Optional[str]) -> str:
    if not language:
        return 'auto'

    lang = language.strip().lower()
    if not lang:
        return 'auto'

    aliases = {
        'chinese': 'zh',
        'mandarin': 'zh',
        'zh-cn': 'zh',
        'zh-hans': 'zh',
        'zh': 'zh',
        'english': 'en',
        'en-us': 'en',
        'en-gb': 'en',
        'en': 'en',
        'japanese': 'ja',
        'ja': 'ja',
        'jp': 'ja',
        'korean': 'ko',
        'ko': 'ko',
        'cantonese': 'yue',
        'yue': 'yue',
        'zh-hk': 'yue',
        'zh-yue': 'yue',
        'auto': 'auto',
    }
    return aliases.get(lang, lang)


def _run_transcribe(audio_path: str, language: Optional[str]):
    with MODEL_INFER_LOCK:
        import soundfile as sf
        from scipy.signal import resample_poly

        lang = _sensevoice_language(language)
        samples, sample_rate = sf.read(audio_path, dtype='float32', always_2d=False)
        samples = np.asarray(samples, dtype=np.float32)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if sample_rate != STREAM_SAMPLE_RATE:
            g = gcd(sample_rate, STREAM_SAMPLE_RATE)
            samples = resample_poly(
                samples,
                STREAM_SAMPLE_RATE // g,
                sample_rate // g,
            ).astype(np.float32)
        return MODEL(
            samples,
            language=lang,
            textnorm='withitn',
        )


def _extract_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        parts = [_extract_text(v) for v in value]
        return ' '.join(part for part in parts if part).strip()
    if isinstance(value, dict):
        for key in ('text', 'pred_text', 'sentence', 'content'):
            if key in value:
                text = _extract_text(value.get(key))
                if text:
                    return text
        for key in ('value', 'result', 'res'):
            if key in value:
                text = _extract_text(value.get(key))
                if text:
                    return text
        return ''

    attr_text = getattr(value, 'text', None)
    if isinstance(attr_text, str):
        return attr_text

    return ''


def _extract_language(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, dict):
        for key in ('language', 'lang', 'lid'):
            lang = value.get(key)
            if isinstance(lang, str) and lang:
                return lang
        for key in ('value', 'result', 'res'):
            lang = _extract_language(value.get(key))
            if lang:
                return lang
        return ''

    attr_language = getattr(value, 'language', None)
    if isinstance(attr_language, str):
        return attr_language

    return ''


def _clean_transcript_text(text: str) -> str:
    if not text:
        return ''
    # SenseVoice may prepend meta tags like <|zh|><|NEUTRAL|><|BGM|><|withitn|>.
    text = re.sub(r'<\|[^|<>]+\|>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _normalize_transcribe_result(results: Any, language: Optional[str]) -> dict[str, str]:
    if not results:
        return {'text': '', 'language': language or ''}

    first: Any = results[0] if isinstance(results, (list, tuple)) else results

    text = _clean_transcript_text(_extract_text(first))
    lang = _extract_language(first)

    if not lang:
        lang = _sensevoice_language(language)

    return {
        'text': text,
        'language': lang,
    }


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
        return _normalize_transcribe_result(results, language)
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


def _pcm16le_to_float32(pcm16le: bytes) -> np.ndarray:
    if not pcm16le:
        return np.zeros((0,), dtype=np.float32)
    x = np.frombuffer(pcm16le, dtype=np.int16).astype(np.float32)
    return x / 32768.0


def _audio_activity_stats(samples: np.ndarray) -> tuple[float, float]:
    if samples.size == 0:
        return 0.0, 0.0
    rms = float(np.sqrt(np.mean(np.square(samples), dtype=np.float64)))
    active_ratio = float(np.mean(np.abs(samples) >= STREAM_VAD_ACTIVE_ABS_THRESHOLD))
    return rms, active_ratio


def _analyze_audio_for_vad(pcm16le: bytes) -> tuple[bool, dict]:
    samples = _pcm16le_to_float32(pcm16le)
    if samples.size == 0:
        return False, {
            'duration_ms': 0,
            'rms': 0.0,
            'active_ratio': 0.0,
            'reason': 'empty',
        }

    duration_ms = int(samples.size * 1000 / STREAM_SAMPLE_RATE)
    rms, active_ratio = _audio_activity_stats(samples)
    if duration_ms < STREAM_VAD_MIN_AUDIO_MS:
        return False, {
            'duration_ms': duration_ms,
            'rms': round(rms, 6),
            'active_ratio': round(active_ratio, 6),
            'reason': 'too_short',
        }
    if rms < STREAM_VAD_MIN_RMS and active_ratio < STREAM_VAD_MIN_ACTIVE_RATIO:
        return False, {
            'duration_ms': duration_ms,
            'rms': round(rms, 6),
            'active_ratio': round(active_ratio, 6),
            'reason': 'low_energy',
        }
    return True, {
        'duration_ms': duration_ms,
        'rms': round(rms, 6),
        'active_ratio': round(active_ratio, 6),
        'reason': 'ok',
    }


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

    normalized = _normalize_transcribe_result(results, req.language)
    if not normalized['text'] and not normalized['language']:
        raise HTTPException(status_code=500, detail='Empty ASR result')

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        'text': normalized['text'],
        'language': normalized['language'],
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

                snapshot = bytes(session.pcm16le)
                should_run, stats = _analyze_audio_for_vad(snapshot)
                if not should_run:
                    if STREAM_VAD_DEBUG:
                        print(
                            f'[asr-stream-vad] skip partial session={session_id} '
                            f'duration_ms={stats["duration_ms"]} rms={stats["rms"]} '
                            f'active_ratio={stats["active_ratio"]} reason={stats["reason"]}'
                        )
                    continue

                try:
                    session.transcribing = True
                    partial = await asyncio.to_thread(
                        _transcribe_pcm16le_bytes,
                        snapshot,
                        session.language,
                    )
                except Exception as exc:
                    if STREAM_VAD_DEBUG:
                        print(f'[asr-stream] skip partial due to error session={session_id}: {exc}')
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

                snapshot = bytes(session.pcm16le)
                should_run, stats = _analyze_audio_for_vad(snapshot)
                if not should_run:
                    if STREAM_VAD_DEBUG:
                        print(
                            f'[asr-stream-vad] skip final session={session_id} '
                            f'duration_ms={stats["duration_ms"]} rms={stats["rms"]} '
                            f'active_ratio={stats["active_ratio"]} reason={stats["reason"]}'
                        )
                    await websocket.send_json(
                        {
                            'type': 'final',
                            'sessionId': session_id,
                            'text': '',
                            'isFinal': True,
                            'language': session.language or '',
                            'elapsedMs': 0,
                        }
                    )
                    continue

                if STREAM_VAD_DEBUG:
                    print(
                        f'[asr-stream-vad] final run session={session_id} '
                        f'duration_ms={stats["duration_ms"]} rms={stats["rms"]} '
                        f'active_ratio={stats["active_ratio"]}'
                    )

                started_at = time.perf_counter()
                try:
                    final = await asyncio.to_thread(
                        _transcribe_pcm16le_bytes,
                        snapshot,
                        session.language,
                    )
                except Exception as exc:
                    if STREAM_VAD_DEBUG:
                        print(f'[asr-stream] fallback empty final due to error session={session_id}: {exc}')
                    await websocket.send_json(
                        {
                            'type': 'final',
                            'sessionId': session_id,
                            'text': '',
                            'isFinal': True,
                            'language': session.language or '',
                            'elapsedMs': 0,
                        }
                    )
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
