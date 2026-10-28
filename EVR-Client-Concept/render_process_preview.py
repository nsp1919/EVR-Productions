"""Record the process section using wheel input, with no step-button clicks."""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
folder = root / "assets" / "process-recording"
folder.mkdir(exist_ok=True)
states = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        record_video_dir=str(folder),
        record_video_size={"width": 1440, "height": 900},
        reduced_motion="no-preference",
    )
    page = context.new_page()
    page.goto((root / "index.html").as_uri() + "#/home")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    bounds = page.locator("#process-story").evaluate("""el=>{
      const s=el.querySelector('.process-stage');
      return {start:el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(s).top),travel:el.offsetHeight-s.offsetHeight};
    }""")
    page.evaluate("(top)=>scrollTo({top,behavior:'instant'})", bounds["start"] + bounds["travel"] * .025)
    page.wait_for_timeout(1000)
    page.mouse.move(735, 460)
    for index, progress in enumerate([.025, .25, .475, .70, .925, .70, .475, .25, .025]):
        if index:
            current = page.evaluate("scrollY")
            target = bounds["start"] + bounds["travel"] * progress
            page.mouse.wheel(0, target - current)
        expected = min(4, int(progress * 5))
        page.wait_for_function("(i)=>document.querySelector('#process-story').dataset.step===String(i)", arg=expected)
        page.wait_for_timeout(1150)
        states.append(page.locator("#process-story").evaluate("""el=>({
          step:Number(el.dataset.step),progress:Number(el.dataset.progress),
          top:el.querySelector('.process-stage').getBoundingClientRect().top,
          phone:el.querySelector('.phone-shell').style.transform,
          line:el.querySelector('.process-progress span').style.transform
        })"""))
    video = Path(page.video.path())
    context.close()
    browser.close()
assert [state["step"] for state in states] == [0, 1, 2, 3, 4, 3, 2, 1, 0]
assert max(state["top"] for state in states) - min(state["top"] for state in states) < 2
assert len({state["phone"] for state in states}) >= 5
assert len({state["line"] for state in states}) >= 5
output = root / "EVR-Process-Scroll-Preview.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.6", "-i", str(video), "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(output)], check=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
video.unlink()
folder.rmdir()
(root / "process-scroll-validation.json").write_text(json.dumps({"input": "mouse wheel only; no step clicks", "states": states, "video_decode": "passed"}, indent=2), encoding="utf-8")
print(json.dumps({"wheel_sequence": [state["step"] + 1 for state in states], "preview": str(output)}, indent=2))
