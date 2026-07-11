"""
FreeXan Caption — Serverless Cloud Forced Aligner (Modal.com)

This script deploys WhisperX Wav2Vec2 forced alignment to Nvidia T4 serverless GPUs.
To deploy:
  1. pip install modal
  2. modal setup (login via browser)
  3. modal deploy modal_aligner.py
"""

import os
import io
import json
import base64
import tempfile
from typing import Dict, Any

# Modal cloud container configuration
try:
    import modal
except ImportError:
    pass

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "fastapi[standard]",
        "torch",
        "whisperx",
    )
)

app = modal.App("freexan-caption-aligner")


@app.function(image=image, gpu="T4", timeout=300, scaledown_window=60)
@modal.fastapi_endpoint(method="POST")
def forced_align_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serverless REST Web Endpoint.
    Expects JSON POST body:
    {
      "audio_base64": "<base64 encoded audio bytes>",
      "text_tokens": ["कोर्नवलक्सा", "नाम", "तो", "सुना", "होगा"],
      "language_code": "hi"
    }
    """
    import whisperx
    import torch

    audio_b64 = payload.get("audio_base64")
    tokens = payload.get("text_tokens", [])
    raw_lang = payload.get("language_code", "hi")
    if not raw_lang or raw_lang == "unknown":
        raw_lang = "hi"
    lang = raw_lang.split("-")[0]

    if not audio_b64 or not tokens:
        return {"status": "error", "message": "Missing 'audio_base64' or 'text_tokens' in request payload."}

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[FreeXan Cloud] Waking up container on {device.upper()} | Aligning {len(tokens)} words in '{lang}'...")

    # 1. Save base64 audio to virtual tmp file
    audio_bytes = base64.b64decode(audio_b64)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_audio:
        tmp_audio.write(audio_bytes)
        tmp_audio_path = tmp_audio.name

    try:
        # 2. Load audio wave
        audio_data = whisperx.load_audio(tmp_audio_path)
        duration_sec = len(audio_data) / 16000.0

        # 3. Prepare fake unaligned segment window for WhisperX
        # We wrap the known Sarvam text tokens into a single sequence block
        full_text = " ".join(tokens)
        input_segments = [{"text": full_text, "start": 0.0, "end": duration_sec}]

        # 4. Load Wav2Vec2 acoustic aligner model
        model_a, metadata = whisperx.load_align_model(language_code=lang, device=device)
        
        # 5. Snap audio physics to text tokens
        aligned_result = whisperx.align(
            input_segments, model_a, metadata, audio_data, device, return_char_alignments=False
        )

        # 6. Format into FreeXan JSON Word Contract
        word_contract = []
        for seg in aligned_result.get("segments", []):
            for w in seg.get("words", []):
                if "start" in w and "end" in w:
                    word_contract.append({
                        "word": w["word"].strip(),
                        "start": round(w["start"], 3),
                        "end": round(w["end"], 3)
                    })

        print(f"[FreeXan Cloud] Successfully aligned {len(word_contract)} frame-exact karaoke words!")
        return {
            "status": "success",
            "engine": "modal-serverless-wav2vec2-gpu",
            "language": lang,
            "durationSec": round(duration_sec, 2),
            "words": word_contract
        }

    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        print(f"[ERROR] Alignment failed: {err_msg}")
        return {"status": "error", "message": str(e), "traceback": err_msg}

    finally:
        if os.path.exists(tmp_audio_path):
            os.remove(tmp_audio_path)
