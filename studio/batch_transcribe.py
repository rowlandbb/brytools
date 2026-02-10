import os
import sys
import time
import json
import datetime
import subprocess
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from faster_whisper import WhisperModel

# --- ULTRA CONFIGURATION ---
WATCH_FOLDER = "/Volumes/ME Backup02/BryTranscribe"
OUTPUT_FOLDER = os.path.join(WATCH_FOLDER, "transcriptions")
DONE_FOLDER = os.path.join(WATCH_FOLDER, "Done")
PROGRESS_FOLDER = os.path.join(WATCH_FOLDER, "progress")
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mkv', '.avi', '.mp3', '.wav', '.m4a'}

MODEL_MAP = {
    "turbo": "large-v3-turbo",
    "fast": "base",
    "balanced": "medium",
    "quality": "large-v3",
}

MAX_PARALLEL_TASKS = 8


def notify(title, text):
    try:
        subprocess.run(["afplay", "/System/Library/Sounds/Glass.aiff"])
        cmd = f'display notification "{text}" with title "{title}"'
        subprocess.run(["osascript", "-e", cmd])
    except:
        pass


def format_timestamp(seconds):
    td = datetime.timedelta(seconds=seconds)
    hours, remainder = divmod(int(td.total_seconds()), 3600)
    minutes, seconds = divmod(remainder, 60)
    milliseconds = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def get_media_duration(filepath):
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(filepath)],
            capture_output=True, text=True, timeout=30
        )
        return float(result.stdout.strip())
    except:
        return None


def write_progress(filename, data):
    os.makedirs(PROGRESS_FOLDER, exist_ok=True)
    progress_path = os.path.join(PROGRESS_FOLDER, f"{filename}.json")
    try:
        with open(progress_path, "w") as f:
            json.dump(data, f)
    except:
        pass


def clear_progress(filename):
    progress_path = os.path.join(PROGRESS_FOLDER, f"{filename}.json")
    try:
        os.remove(progress_path)
    except:
        pass


def check_cancelled(input_path):
    """Check if a cancel marker exists for this file."""
    cancel_path = input_path + ".cancel"
    if os.path.exists(cancel_path):
        try:
            os.remove(cancel_path)
        except:
            pass
        return True
    # Also cancelled if the source file was deleted
    if not os.path.exists(input_path):
        return True
    return False


def read_model_sidecar(input_path):
    sidecar_path = input_path + ".model"
    try:
        if os.path.exists(sidecar_path):
            with open(sidecar_path, "r") as f:
                data = json.load(f)
            os.remove(sidecar_path)
            preset = data.get("preset", "quality")
            whisper_model = data.get("whisperModel", MODEL_MAP.get(preset, "large-v3"))
            print(f"  📋 Sidecar: preset={preset}, model={whisper_model}")
            return whisper_model
    except Exception as e:
        print(f"  ⚠️ Sidecar error: {e}")
    return None


def get_versioned_path(output_srt):
    """If output file already exists, return a versioned path (_v2, _v3, etc.)."""
    if not os.path.exists(output_srt):
        return output_srt

    base, ext = os.path.splitext(output_srt)
    version = 2
    while os.path.exists(f"{base}_v{version}{ext}"):
        version += 1
    versioned = f"{base}_v{version}{ext}"
    print(f"  📎 Existing transcript found, saving as: {Path(versioned).name}")
    return versioned


def transcribe_worker(input_path, fallback_model_id, friendly_name):
    file_name = Path(input_path).name
    file_stem = Path(input_path).stem
    output_srt = get_versioned_path(os.path.join(OUTPUT_FOLDER, f"{file_stem}.srt"))
    dest_path = os.path.join(DONE_FOLDER, file_name)

    if not os.path.exists(input_path):
        return

    model_id = read_model_sidecar(input_path) or fallback_model_id
    duration = get_media_duration(input_path)
    file_size = os.path.getsize(input_path)

    print(f"🚀 Processing: {file_name}")
    print(f"  Model: {model_id} | Duration: {round(duration, 1) if duration else '?'}s | Size: {round(file_size / 1048576, 1)}MB")

    write_progress(file_name, {
        "status": "loading_model",
        "percent": 0,
        "elapsed": 0,
        "eta": None,
        "model": model_id,
        "duration": duration,
        "fileSize": file_size,
        "segments": 0,
        "currentTime": 0,
    })

    try:
        model_start = time.time()
        model = WhisperModel(model_id, device="cpu", compute_type="float32", cpu_threads=4)
        print(f"  Model loaded in {round(time.time() - model_start, 1)}s")

        # Check cancel after model load
        if check_cancelled(input_path):
            print(f"  ⛔ Cancelled: {file_name}")
            clear_progress(file_name)
            return

        start_time = time.time()

        write_progress(file_name, {
            "status": "transcribing",
            "percent": 0,
            "elapsed": 0,
            "eta": None,
            "model": model_id,
            "duration": duration,
            "fileSize": file_size,
            "segments": 0,
            "currentTime": 0,
        })

        segments, info = model.transcribe(str(input_path), beam_size=5)

        if not duration and hasattr(info, 'duration'):
            duration = info.duration

        segment_count = 0
        last_progress_write = 0

        with open(output_srt, "w", encoding="utf-8") as f:
            for i, seg in enumerate(segments, 1):
                f.write(f"{i}\n{format_timestamp(seg.start)} --> {format_timestamp(seg.end)}\n{seg.text.strip()}\n\n")
                segment_count = i

                now = time.time()
                if now - last_progress_write >= 2:
                    last_progress_write = now

                    # Check cancel during transcription
                    if check_cancelled(input_path):
                        print(f"  ⛔ Cancelled mid-transcription: {file_name}")
                        clear_progress(file_name)
                        try:
                            os.remove(output_srt)
                        except:
                            pass
                        return

                    elapsed = now - start_time
                    current_time = seg.end

                    if duration and duration > 0:
                        percent = min(99, round((current_time / duration) * 100, 1))
                        speed = current_time / elapsed if elapsed > 0 else 0
                        remaining_media = duration - current_time
                        eta = round(remaining_media / speed) if speed > 0 else None
                    else:
                        percent = None
                        eta = None

                    write_progress(file_name, {
                        "status": "transcribing",
                        "percent": percent,
                        "elapsed": round(elapsed, 1),
                        "eta": eta,
                        "model": model_id,
                        "duration": duration,
                        "fileSize": file_size,
                        "segments": segment_count,
                        "currentTime": round(current_time, 1),
                    })

        elapsed = round(time.time() - start_time, 1)
        print(f"  ✅ Done in {elapsed}s ({segment_count} segments)")

        write_progress(file_name, {
            "status": "complete",
            "percent": 100,
            "elapsed": elapsed,
            "eta": 0,
            "model": model_id,
            "duration": duration,
            "fileSize": file_size,
            "segments": segment_count,
            "currentTime": duration,
        })

        # Move source to Done (overwrite if already there from previous run)
        if os.path.exists(dest_path):
            os.remove(dest_path)
        shutil.move(input_path, dest_path)
        notify("Transcription Done", f"{file_stem} in {elapsed}s")

        time.sleep(3)
        clear_progress(file_name)

    except Exception as e:
        print(f"  ❌ Error: {file_name}: {e}")
        write_progress(file_name, {
            "status": "error",
            "error": str(e),
            "model": model_id,
        })


def get_model_choice():
    print("\n" + "=" * 50)
    print("      🎥 BRY-TRANSCRIBE ULTRA v8.0")
    print("         with BryScribe Progress")
    print("=" * 50)
    print(" 1) TURBO   (large-v3-turbo)")
    print(" 2) LARGE   (large-v3)")
    print(" 3) MEDIUM  (medium)")
    print(" 4) AUTO    (read .model sidecars, fallback large-v3)")
    print("=" * 50)
    choice = input(" Select fallback model [1-4]: ")
    models = {
        "1": ("large-v3-turbo", "TURBO"),
        "2": ("large-v3", "LARGE"),
        "3": ("medium", "MEDIUM"),
        "4": ("large-v3", "AUTO"),
    }
    return models.get(choice, models["4"])


def main():
    if not os.path.exists(WATCH_FOLDER):
        print(f"⚠️ Drive not found: {WATCH_FOLDER}")
        return

    # Accept model choice via command line arg for headless/SSH use
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        models = {"1": ("large-v3-turbo", "TURBO"), "2": ("large-v3", "LARGE"),
                   "3": ("medium", "MEDIUM"), "4": ("large-v3", "AUTO"),
                   "turbo": ("large-v3-turbo", "TURBO"), "large": ("large-v3", "LARGE"),
                   "medium": ("medium", "MEDIUM"), "auto": ("large-v3", "AUTO")}
        model_id, friendly_name = models.get(arg, models["4"])
    else:
        model_id, friendly_name = get_model_choice()
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    os.makedirs(DONE_FOLDER, exist_ok=True)
    os.makedirs(PROGRESS_FOLDER, exist_ok=True)

    print(f"\n⚡ WATCHER ACTIVE ({MAX_PARALLEL_TASKS} slots)")
    print(f"   Model: {model_id} ({friendly_name})")
    print(f"   Watching: {WATCH_FOLDER}\n")

    active_files = set()

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_TASKS) as executor:
        try:
            while True:
                all_current = os.listdir(WATCH_FOLDER)
                eligible = [
                    f for f in all_current
                    if Path(f).suffix.lower() in VIDEO_EXTENSIONS
                ]

                for filename in eligible:
                    full_path = os.path.join(WATCH_FOLDER, filename)

                    if filename not in active_files:
                        # Skip cancelled files
                        cancel_path = full_path + ".cancel"
                        if os.path.exists(cancel_path):
                            try:
                                os.remove(cancel_path)
                                os.remove(full_path)
                            except:
                                pass
                            continue

                        try:
                            if os.path.getsize(full_path) > 0:
                                active_files.add(filename)

                                def done_cb(fut, fn=filename):
                                    active_files.discard(fn)

                                future = executor.submit(
                                    transcribe_worker, full_path, model_id, friendly_name
                                )
                                future.add_done_callback(done_cb)
                        except OSError:
                            pass

                time.sleep(5)
        except KeyboardInterrupt:
            print("\nShutting down...")


if __name__ == "__main__":
    main()
