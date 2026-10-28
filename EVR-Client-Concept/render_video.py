"""Build a short narrated slideshow from the locally rendered concept."""
from pathlib import Path
import json
import subprocess
import wave

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
clips = []
elapsed = 0
chapters = []
for number in range(1, 6):
    audio = ASSETS / f"narration-{number}.wav"
    with wave.open(str(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate() + 0.7
    clip = ASSETS / f"segment-{number}.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-loop", "1", "-framerate", "25", "-i", str(ASSETS / f"slide-{number}.png"),
        "-i", str(audio), "-vf", "scale=1600:900,format=yuv420p",
        "-af", "apad=pad_dur=0.7", "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", str(clip),
    ], check=True)
    clips.append(clip)
    chapters.append({"slide": number, "start_seconds": round(elapsed, 2), "duration_seconds": round(duration, 2)})
    elapsed += duration
listing = ASSETS / "video-concat.txt"
listing.write_text("\n".join(f"file '{clip.name}'" for clip in clips), encoding="utf-8")
output = ROOT / "EVR-Walkthrough.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(output)], check=True)
probe = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)], check=True, capture_output=True, text=True)
metadata = json.loads(probe.stdout)
video = next(stream for stream in metadata["streams"] if stream["codec_type"] == "video")
audio = next(stream for stream in metadata["streams"] if stream["codec_type"] == "audio")
assert video["width"] == 1600 and video["height"] == 900
assert audio["codec_name"] == "aac"
assert 60 <= float(metadata["format"]["duration"]) <= 100, metadata["format"]["duration"]
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
(ROOT / "walkthrough-details.json").write_text(json.dumps({"duration_seconds": float(metadata["format"]["duration"]), "size_bytes": int(metadata["format"]["size"]), "narration": "Locally synthesised Microsoft Zira Desktop, English", "chapters": chapters, "full_decode": "passed"}, indent=2), encoding="utf-8")
for clip in clips:
    clip.unlink()
listing.unlink()
print(json.dumps({"file": str(output), "duration": metadata["format"]["duration"], "size_bytes": metadata["format"]["size"]}, indent=2))
