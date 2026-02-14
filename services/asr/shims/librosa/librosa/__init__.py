"""Minimal librosa shim for qwen-asr on macOS.

Implements only the APIs used by qwen_asr.inference.utils:
- load(path, sr=None, mono=False)
- resample(y, orig_sr, target_sr)
"""
from __future__ import annotations

from typing import Tuple

import numpy as np
import soundfile as sf

__version__ = "0.10.2"


def load(path: str, sr: int | None = None, mono: bool = False) -> Tuple[np.ndarray, int]:
    audio, in_sr = sf.read(path, dtype="float32", always_2d=not mono)
    if mono and audio.ndim > 1:
        audio = np.mean(audio, axis=1).astype(np.float32)
    if sr is not None and sr != int(in_sr):
        audio = resample(audio, orig_sr=int(in_sr), target_sr=int(sr))
        in_sr = sr
    return np.asarray(audio, dtype=np.float32), int(in_sr)


def resample(y: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return np.asarray(y, dtype=np.float32)

    y = np.asarray(y, dtype=np.float32)
    ratio = float(target_sr) / float(orig_sr)
    if y.ndim == 1:
        x_old = np.arange(y.shape[0], dtype=np.float32)
        x_new = np.arange(int(np.ceil(y.shape[0] * ratio)), dtype=np.float32) / ratio
        return np.interp(x_new, x_old, y).astype(np.float32)

    # Handle (T, C) or (C, T) by resampling along last axis if it is time-like.
    if y.ndim == 2:
        # assume time is axis 0 when shape[0] >> shape[1]
        time_axis = 0 if y.shape[0] >= y.shape[1] else 1
        if time_axis == 1:
            y = y.T
        x_old = np.arange(y.shape[0], dtype=np.float32)
        x_new = np.arange(int(np.ceil(y.shape[0] * ratio)), dtype=np.float32) / ratio
        res = np.vstack([np.interp(x_new, x_old, y[:, i]) for i in range(y.shape[1])]).T
        if time_axis == 1:
            res = res.T
        return res.astype(np.float32)

    raise ValueError(f"Unsupported audio shape: {y.shape}")
