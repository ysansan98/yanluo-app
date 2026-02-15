#!/usr/bin/env python3
"""Debug client for /asr/stream WebSocket.

Usage:
  # 1) Stream a local wav file in near-realtime
  services/asr/.venv/bin/python services/asr/stream_debug_client.py \
    --wav /absolute/path/to/test.wav --language Chinese

  # 2) Protocol smoke test with generated silence
  services/asr/.venv/bin/python services/asr/stream_debug_client.py \
    --silence-seconds 2.0
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import time
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np
import websockets

TARGET_SR = 16000
TARGET_CH = 1


@dataclass
class PcmPayload:
    pcm16le: bytes
    sample_rate: int = TARGET_SR


def _float_to_int16(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, -1.0, 1.0)
    y = np.where(x < 0, x * 32768.0, x * 32767.0)
    return y.astype(np.int16)


def _resample_linear(x: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return x
    if x.size == 0:
        return x
    ratio = src_sr / dst_sr
    out_len = max(1, int(np.floor(x.size / ratio)))
    idx = np.arange(out_len, dtype=np.float64) * ratio
    low = np.floor(idx).astype(np.int64)
    high = np.minimum(low + 1, x.size - 1)
    w = idx - low
    return (x[low] * (1.0 - w) + x[high] * w).astype(np.float32)


def load_wav_to_pcm16le(path: Path) -> PcmPayload:
    with wave.open(str(path), 'rb') as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        n = wf.getnframes()
        raw = wf.readframes(n)

    if sw != 2:
        raise ValueError(f'Only 16-bit PCM wav is supported, got sample width={sw}')

    arr = np.frombuffer(raw, dtype=np.int16)
    if ch > 1:
        arr = arr.reshape(-1, ch).mean(axis=1).astype(np.int16)

    x = (arr.astype(np.float32) / 32768.0)
    x = _resample_linear(x, sr, TARGET_SR)
    pcm = _float_to_int16(x).tobytes()
    return PcmPayload(pcm16le=pcm, sample_rate=TARGET_SR)


def make_silence(seconds: float) -> PcmPayload:
    n = max(1, int(seconds * TARGET_SR))
    return PcmPayload(pcm16le=(np.zeros((n,), dtype=np.int16)).tobytes(), sample_rate=TARGET_SR)


def iter_chunks(pcm16le: bytes, chunk_ms: int):
    bytes_per_chunk = int(TARGET_SR * 2 * chunk_ms / 1000)
    i = 0
    while i < len(pcm16le):
        yield pcm16le[i:i + bytes_per_chunk]
        i += bytes_per_chunk


async def run_stream(
    ws_url: str,
    payload: PcmPayload,
    language: str,
    chunk_ms: int,
    realtime: bool,
) -> None:
    session_id = f'debug-{uuid.uuid4().hex[:8]}'
    t0 = time.perf_counter()
    first_partial_at = None
    partial_count = 0

    print(f'[debug] connect {ws_url}')
    async with websockets.connect(ws_url, max_size=20 * 1024 * 1024) as ws:
        await ws.send(json.dumps({
            'type': 'start',
            'sessionId': session_id,
            'sampleRate': payload.sample_rate,
            'language': language,
        }))
        print(f'[debug] start sent session={session_id} sr={payload.sample_rate} lang={language}')

        async def sender():
            for idx, chunk in enumerate(iter_chunks(payload.pcm16le, chunk_ms), start=1):
                await ws.send(json.dumps({
                    'type': 'audio',
                    'sessionId': session_id,
                    'pcm16leBase64': base64.b64encode(chunk).decode('ascii'),
                }))
                if idx % 25 == 0:
                    print(f'[debug] sent chunks={idx}')
                if realtime:
                    await asyncio.sleep(chunk_ms / 1000.0)

            await ws.send(json.dumps({'type': 'end', 'sessionId': session_id}))
            print('[debug] end sent')

        async def receiver():
            nonlocal first_partial_at, partial_count
            while True:
                msg = json.loads(await ws.recv())
                t = int((time.perf_counter() - t0) * 1000)
                if msg.get('type') == 'partial':
                    partial_count += 1
                    if first_partial_at is None:
                        first_partial_at = t
                    print(f"[partial +{t}ms] {msg.get('text', '')}")
                elif msg.get('type') == 'final':
                    print(f"[final +{t}ms] {msg.get('text', '')}")
                    print(f"[debug] done partial_count={partial_count} first_partial_ms={first_partial_at}")
                    return
                elif msg.get('type') == 'error':
                    print(f"[error +{t}ms] code={msg.get('code')} msg={msg.get('message')}")
                    return
                else:
                    print(f'[debug] unknown msg: {msg}')

        await asyncio.gather(sender(), receiver())


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Stream debug client for yanluo asr websocket')
    p.add_argument('--ws-url', default='ws://127.0.0.1:8790/asr/stream')
    p.add_argument('--wav', type=Path, default=None, help='16-bit PCM WAV path')
    p.add_argument('--silence-seconds', type=float, default=0.0)
    p.add_argument('--language', default='Chinese')
    p.add_argument('--chunk-ms', type=int, default=40)
    p.add_argument('--no-realtime', action='store_true', help='Send as fast as possible')
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.wav is None and args.silence_seconds <= 0:
        print('error: provide --wav or --silence-seconds')
        return 2

    if args.wav is not None:
        payload = load_wav_to_pcm16le(args.wav)
        print(f'[debug] loaded wav={args.wav} bytes={len(payload.pcm16le)}')
    else:
        payload = make_silence(args.silence_seconds)
        print(f'[debug] generated silence seconds={args.silence_seconds} bytes={len(payload.pcm16le)}')

    asyncio.run(
        run_stream(
            ws_url=args.ws_url,
            payload=payload,
            language=args.language,
            chunk_ms=args.chunk_ms,
            realtime=not args.no_realtime,
        )
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
