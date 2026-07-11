"""
freeXan Caption — Isolated AI Transcriber Engine (Sandbox Phase 1)

This standalone script verifies the faster-whisper + WhisperX forced alignment
pipeline. It loads an audio file, transcribes it, aligns word timestamps down
to the millisecond, and outputs a clean JSON contract matching freeXan's needs.
"""
import sys
import json
import time
import os

def run_pipeline(audio_path: str, model_size: str = "large-v3", device: str = "cuda", compute_type: str = "float16"):
    print(f"[freeXan AI] Initializing faster-whisper ({model_size}) on {device} ({compute_type})...")
    t0 = time.time()
    
    try:
        import whisperx
    except ImportError:
        print("[ERROR] 'whisperx' library is not installed in this environment.")
        print("Please run setup_sandbox.bat or: pip install faster-whisper whisperx")
        sys.exit(1)

    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found at: {audio_path}")
        sys.exit(1)

    # 1. Load audio
    print(f"[freeXan AI] Loading audio file: {audio_path}")
    audio = whisperx.load_audio(audio_path)

    # 2. Transcribe with faster-whisper backend inside whisperX
    print("[freeXan AI] Step 1/3: Transcribing audio layout...")
    model = whisperx.load_model(model_size, device, compute_type=compute_type)
    result = model.transcribe(audio, batch_size=16)
    detected_lang = result["language"]
    print(f"[freeXan AI] Detected Language: '{detected_lang}'")

    # 3. Align timestamps down to phoneme/millisecond level
    print("[freeXan AI] Step 2/3: Executing Wav2Vec2 Forced Phonetic Alignment...")
    model_a, metadata = whisperx.load_align_model(language_code=detected_lang, device=device)
    aligned_result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

    t_elapsed = time.time() - t0
    print(f"[freeXan AI] Step 3/3: Pipeline Complete in {t_elapsed:.2f}s!")

    # 4. Format strictly into freeXan JSON Contract
    contract = {
        "status": "success",
        "engine": f"faster-whisper+{model_size}+whisperx",
        "durationMs": int(t_elapsed * 1000),
        "language": detected_lang,
        "segments": []
    }

    for seg in aligned_result["segments"]:
        seg_data = {
            "text": seg["text"].strip(),
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "words": []
        }
        if "words" in seg:
            for w in seg["words"]:
                if "start" in w and "end" in w:
                    seg_data["words"].append({
                        "word": w["word"].strip(),
                        "start": round(w["start"], 3),
                        "end": round(w["end"], 3),
                        "score": round(w.get("score", 0.0), 2)
                    })
        contract["segments"].append(seg_data)

    return contract

if __name__ == "__main__":
    # Sandbox Test Entry Point
    # Check CLI arguments or use dummy sample audio
    sample_audio = sys.argv[1] if len(sys.argv) > 1 else "sample_hinglish.wav"
    
    print("============================================================")
    print(" freeXan Transcriber Sandbox — Phase 1 Test")
    print("============================================================")
    
    # If sample doesn't exist, generate a quick tone/warning or ask user
    if not os.path.exists(sample_audio):
        print(f"[INFO] '{sample_audio}' not found. Please place a test audio file (.wav/.mp3) in this directory.")
        print(f"Usage: python core_engine.py <path_to_audio_file>")
        sys.exit(0)

    # Run pipeline
    output_json = run_pipeline(sample_audio, model_size="medium", device="cuda", compute_type="float16")
    
    # Print formatted contract
    print("\n[JSON Contract Output]:")
    print(json.dumps(output_json, indent=2, ensure_ascii=False))
    
    # Save to disk for inspection
    out_file = "last_transcription.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_json, f, indent=2, ensure_ascii=False)
    print(f"\nSaved contract to: {os.path.abspath(out_file)}")
