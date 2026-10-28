"""Create an original illustrated playback sample, without third-party footage."""
from pathlib import Path
import argparse
import subprocess
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("scene", choices=["wedding", "studio"])
scene = parser.parse_args().scene
root = Path(__file__).resolve().parent
poster = root / "assets" / f"demo-{scene}-poster.png"
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 720, "height": 960})
    artwork = (root / f"{scene}-scene.svg").read_text(encoding="utf-8")
    page.set_content(f"""<!doctype html><html><head><style>
      body{{margin:0;background:#e8ddcd}}svg{{width:100vw;height:100vh;object-fit:cover;display:block}}
      aside{{position:fixed;bottom:50px;left:50px;right:50px;padding:20px;background:#233c36e6;color:white;font:15px/1.7 Arial;text-align:center;border-radius:15px}}
      b{{display:block;font-size:23px;letter-spacing:2px}}
      </style></head><body>{artwork}<aside><b>EVR / MOTION SAMPLE</b>Original illustration · Not client footage<br>Replace with approved EVR media</aside></body></html>""")
    page.screenshot(path=str(poster))
    browser.close()
output = root / "assets" / f"demo-{scene}.mp4"
subprocess.run([
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(poster),
    "-vf", "zoompan=z='1+0.00025*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=175:s=720x960:fps=25",
    "-t", "7", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", str(output),
], check=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
print(f"Created and decoded: {output}")
