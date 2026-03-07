import asyncio
import base64
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

app = FastAPI()

LOG_LEVEL = os.getenv('ASR_LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger('asr-service')

MODEL = None
MODEL_LOAD_ERROR = None
MODEL_RUNTIME = {}
MODEL_INFER_LOCK = threading.Lock()
MODEL_ASSETS: dict[str, str] = {}
MODEL_BY_LANG: dict[str, Any] = {}

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


def _resolve_model_dir() -> str:
    if MODEL_DIR and os.path.isdir(MODEL_DIR):
        return MODEL_DIR

    if ALLOW_DOWNLOAD:
        try:
            from modelscope import snapshot_download

            return snapshot_download(MODEL_NAME)
        except Exception as exc:
            raise RuntimeError(f'Failed to download model {MODEL_NAME}: {exc}') from exc

    raise RuntimeError(
        'Model not found. Set ASR_MODEL_DIR to a valid local model folder '
        'or set ASR_ALLOW_DOWNLOAD=1 to allow automatic download.'
    )


def _pick_model_file(model_dir: str) -> str:
    candidates = [
        'model.int8.onnx',
        'model_quant.onnx',
        'model.onnx',
    ]
    for name in candidates:
        p = os.path.join(model_dir, name)
        if os.path.exists(p):
            return p
    raise RuntimeError(
        f'No SenseVoice ONNX model file found in {model_dir}. '
        'Expected one of: model.int8.onnx, model_quant.onnx, model.onnx'
    )


def _prepare_tokens_file(model_dir: str) -> str:
    txt_path = os.path.join(model_dir, 'tokens.txt')
    if os.path.exists(txt_path):
        try:
            with open(txt_path, encoding='utf-8') as f:
                # sherpa tokens.txt format: "<token> <id>"
                first_non_empty = ''
                for line in f:
                    line = line.strip()
                    if line:
                        first_non_empty = line
                        break
            if first_non_empty:
                parts = first_non_empty.rsplit(' ', 1)
                if len(parts) == 2 and parts[1].isdigit():
                    return txt_path
        except Exception:
            pass

    json_path = os.path.join(model_dir, 'tokens.json')
    if not os.path.exists(json_path):
        raise RuntimeError('SenseVoice tokens file not found: expected tokens.txt or tokens.json')

    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    tokens: list[str]
    if isinstance(data, list):
        tokens = [str(v) for v in data]
    elif isinstance(data, dict):
        if 'tokens' in data and isinstance(data['tokens'], list):
            tokens = [str(v) for v in data['tokens']]
        else:
            # Fallback for id->token mapping dictionaries
            items: list[tuple[int, str]] = []
            for k, v in data.items():
                try:
                    items.append((int(k), str(v)))
                except Exception:
                    continue
            if not items:
                raise RuntimeError('tokens.json format is unsupported')
            items.sort(key=lambda x: x[0])
            tokens = [v for _, v in items]
    else:
        raise RuntimeError('tokens.json format is unsupported')

    if not tokens:
        raise RuntimeError('tokens.json is empty')

    with open(txt_path, 'w', encoding='utf-8') as f:
        # sherpa-onnx expects "token id" per line instead of bare token strings.
        for idx, token in enumerate(tokens):
            f.write(f'{token} {idx}\n')

    return txt_path


def _parse_am_mvn_vectors(am_mvn_path: str) -> tuple[str, str]:
    if not os.path.exists(am_mvn_path):
        raise RuntimeError(f'am.mvn not found: {am_mvn_path}')

    with open(am_mvn_path, encoding='utf-8') as f:
        content = f.read()

    vectors = re.findall(r'<LearnRateCoef>\s+0\s+\[\s*([^\]]+?)\s*\]', content, flags=re.S)
    if len(vectors) < 2:
        raise RuntimeError(f'Failed to parse neg_mean/inv_stddev from {am_mvn_path}')

    def _normalize_vector(vec: str) -> str:
        parts = [part.strip() for part in vec.replace('\n', ' ').split(' ') if part.strip()]
        return ','.join(parts)

    neg_mean = _normalize_vector(vectors[0])
    inv_stddev = _normalize_vector(vectors[1])
    return neg_mean, inv_stddev


def _ensure_sherpa_metadata(model_dir: str, model_path: str, vocab_size: int) -> str:
    try:
        import onnx
    except ModuleNotFoundError as exc:
        raise RuntimeError('Missing dependency onnx; run: pip install onnx') from exc

    required_keys = {
        'vocab_size',
        'model_type',
        'lang_auto',
        'with_itn',
        'without_itn',
        'neg_mean',
        'inv_stddev',
    }

    model = onnx.load(model_path)
    metadata = {entry.key: entry.value for entry in model.metadata_props}
    if required_keys.issubset(metadata.keys()):
        return model_path

    am_mvn_path = os.path.join(model_dir, 'am.mvn')
    neg_mean, inv_stddev = _parse_am_mvn_vectors(am_mvn_path)

    patched_path = f'{model_path}.sherpa.onnx'
    metadata.update(
        {
            'model_type': 'sense_voice_ctc',
            'version': '2',
            'comment': 'iic/SenseVoiceSmall',
            'maintainer': 'yanluo-app',
            'model_author': 'iic',
            'url': 'https://www.modelscope.cn/models/iic/SenseVoiceSmall-onnx',
            'vocab_size': str(vocab_size),
            'lang_auto': '0',
            'lang_zh': '3',
            'lang_en': '4',
            'lang_yue': '7',
            'lang_ja': '11',
            'lang_ko': '12',
            'lang_nospeech': '13',
            'with_itn': '14',
            'without_itn': '15',
            'normalize_samples': '0',
            'lfr_window_size': '7',
            'lfr_window_shift': '6',
            'neg_mean': neg_mean,
            'inv_stddev': inv_stddev,
        }
    )

    del model.metadata_props[:]
    for key, value in metadata.items():
        item = model.metadata_props.add()
        item.key = str(key)
        item.value = str(value)

    onnx.save(model, patched_path)
    return patched_path


def _normalize_language(language: Optional[str]) -> str:
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


def _create_recognizer(model_path: str, tokens_path: str, language: str):
    try:
        import sherpa_onnx
    except ModuleNotFoundError as exc:
        missing_module = getattr(exc, 'name', None) or 'unknown'
        raise RuntimeError(
            'SenseVoice ONNX backend requires extra dependencies. '
            f'Missing module: {missing_module}. '
            'Run: pip install sherpa-onnx'
        ) from exc

    # sherpa-onnx expects empty language for auto.
    sherpa_lang = '' if language == 'auto' else language

    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=model_path,
        tokens=tokens_path,
        num_threads=max(1, int(os.getenv('ASR_SHERPA_THREADS', '4'))),
        provider=os.getenv('ASR_SHERPA_PROVIDER', 'cpu'),
        language=sherpa_lang,
        use_itn=True,
        debug=False,
    )


def _load_model_impl() -> tuple[Any, dict[str, str]]:
    model_dir = _resolve_model_dir()
    model_path_raw = _pick_model_file(model_dir)
    tokens_path = _prepare_tokens_file(model_dir)
    with open(tokens_path, encoding='utf-8') as f:
        vocab_size = sum(1 for _ in f)

    model_path = _ensure_sherpa_metadata(model_dir, model_path_raw, vocab_size)

    recognizer = _create_recognizer(model_path, tokens_path, 'auto')

    MODEL_ASSETS['model_dir'] = model_dir
    MODEL_ASSETS['model_path'] = model_path
    MODEL_ASSETS['tokens_path'] = tokens_path

    runtime = {
        'backend': 'sensevoice',
        'engine': 'sherpa_onnx',
        'device': os.getenv('ASR_SHERPA_PROVIDER', 'cpu'),
        'dtype': 'int8',
    }
    return recognizer, runtime


def _load_model():
    global MODEL, MODEL_LOAD_ERROR, MODEL_RUNTIME
    if MODEL is not None or MODEL_LOAD_ERROR is not None:
        return

    try:
        MODEL, MODEL_RUNTIME = _load_model_impl()
        MODEL_BY_LANG['auto'] = MODEL
    except Exception as exc:
        MODEL_LOAD_ERROR = exc


def _ensure_model_ready() -> None:
    _load_model()
    if MODEL_LOAD_ERROR:
        raise RuntimeError(str(MODEL_LOAD_ERROR))
    if MODEL is None:
        raise RuntimeError('Model failed to load')


def _get_recognizer(language: Optional[str]):
    lang = _normalize_language(language)
    model_path = MODEL_ASSETS.get('model_path')
    tokens_path = MODEL_ASSETS.get('tokens_path')
    if not model_path or not tokens_path:
        raise RuntimeError('Model assets are not ready')

    if lang in MODEL_BY_LANG:
        return MODEL_BY_LANG[lang], lang

    recognizer = _create_recognizer(model_path, tokens_path, lang)
    MODEL_BY_LANG[lang] = recognizer
    return recognizer, lang


def _resample_linear(samples: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or samples.size == 0:
        return samples.astype(np.float32, copy=False)

    duration = samples.shape[0] / float(src_rate)
    dst_len = max(1, int(round(duration * dst_rate)))
    src_index = np.linspace(0.0, samples.shape[0] - 1, num=samples.shape[0], dtype=np.float64)
    dst_index = np.linspace(0.0, samples.shape[0] - 1, num=dst_len, dtype=np.float64)
    return np.interp(dst_index, src_index, samples).astype(np.float32)


def _transcribe_samples(samples: np.ndarray, sample_rate: int, language: Optional[str]) -> dict[str, str]:
    with MODEL_INFER_LOCK:
        recognizer, lang = _get_recognizer(language)

        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        samples = np.asarray(samples, dtype=np.float32)

        if sample_rate != STREAM_SAMPLE_RATE:
            # Keep explicit resampling for stable behavior across input formats.
            samples = _resample_linear(samples, sample_rate, STREAM_SAMPLE_RATE)

        stream = recognizer.create_stream()
        stream.accept_waveform(STREAM_SAMPLE_RATE, samples)
        recognizer.decode_stream(stream)

        text = _clean_transcript_text((stream.result.text or '').strip())
        return {
            'text': text,
            'language': lang,
        }


def _run_transcribe(audio_path: str, language: Optional[str]) -> dict[str, str]:
    import soundfile as sf

    samples, sample_rate = sf.read(audio_path, dtype='float32', always_2d=False)
    return _transcribe_samples(np.asarray(samples, dtype=np.float32), int(sample_rate), language)


def _clean_transcript_text(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'<\|[^|<>]+\|>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _transcribe_pcm16le_bytes(pcm16le: bytes, language: Optional[str]):
    if not pcm16le:
        return {'text': '', 'language': _normalize_language(language)}

    samples = np.frombuffer(pcm16le, dtype=np.int16).astype(np.float32) / 32768.0
    return _transcribe_samples(samples, STREAM_SAMPLE_RATE, language)


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
        result = _run_transcribe(req.path, req.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not result['text'] and not result['language']:
        raise HTTPException(status_code=500, detail='Empty ASR result')

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        'text': result['text'],
        'language': result['language'],
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
                        logger.debug(
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
                        logger.warning(
                            f'[asr-stream] skip partial due to error session={session_id}: {exc}'
                        )
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
                        logger.debug(
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
                            'language': _normalize_language(session.language),
                            'elapsedMs': 0,
                        }
                    )
                    continue

                if STREAM_VAD_DEBUG:
                    logger.debug(
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
                        logger.warning(
                            f'[asr-stream] fallback empty final due to error session={session_id}: {exc}'
                        )
                    await websocket.send_json(
                        {
                            'type': 'final',
                            'sessionId': session_id,
                            'text': '',
                            'isFinal': True,
                            'language': _normalize_language(session.language),
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
