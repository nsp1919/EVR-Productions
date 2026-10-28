"""Verify and record the pinned, reversible EVR hero sequence."""
from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
recording_dir = ASSETS / "motion-recording"
recording_dir.mkdir(exist_ok=True)
checks = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def geometry(page):
    return page.locator(".hero-story").evaluate("""el => {
        const stage=el.querySelector('.hero-stage');
        return {start:el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top),
                travel:el.offsetHeight-stage.offsetHeight};
    }""")


def seek(page, progress, wait=900):
    bounds = geometry(page)
    page.evaluate("(y)=>scrollTo({top:y,behavior:'smooth'})", bounds["start"] + bounds["travel"] * progress)
    page.wait_for_timeout(wait)
    page.wait_for_function("(p)=>Math.abs(Number(document.querySelector('.hero-story').dataset.progress)-p)<.004", arg=progress)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        record_video_dir=str(recording_dir),
        record_video_size={"width": 1440, "height": 900},
        reduced_motion="no-preference",
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    url = (ROOT / "index.html").as_uri() + "#/home"
    page.goto(url)
    page.wait_for_function("document.querySelector('.hero-story').dataset.progress !== undefined")
    check(page.locator(".hero-story").evaluate("(el)=>el.classList.contains('is-animated')"), "Hero enables sticky scroll sequence")
    check(page.locator(".hero-copy").evaluate("(el)=>getComputedStyle(el).opacity==='1' && !el.inert"), "Initial hero copy and links are visible and interactive")
    check(page.locator(".story-decisions").evaluate("(el)=>el.inert"), "Invisible service links are not keyboard reachable")
    check(page.locator(".reveal-ready").count() > 10, "Below-hero section reveals remain enabled")
    page.screenshot(path=str(ASSETS / "hero-step-01-intro.png"))
    page.wait_for_timeout(1200)
    for index in [0, 1, 2]:
        button = page.locator(f'[data-select-card="{index}"]')
        button.focus()
        page.keyboard.press("Enter")
        page.wait_for_timeout(850)
        check(button.get_attribute("aria-pressed") == "true", f"Hero card {index} can be brought to the front")
    page.locator('[data-select-card="2"]').evaluate("(el)=>el.blur()")
    initial = page.locator('[data-card="2"]').evaluate("(el)=>getComputedStyle(el).transform")
    pinned_positions = []
    for progress, filename in [(0.20, "02-stack"), (0.49, "03-gallery"), (0.65, "04-statement"), (0.80, "06-notes"), (0.95, "05-choices")]:
        seek(page, progress, 1600)
        pinned_positions.append(page.locator(".hero-stage").bounding_box()["y"])
        check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"No desktop overflow at progress {progress}")
        page.screenshot(path=str(ASSETS / f"hero-step-{filename}.png"))
        if progress == .49:
            left = page.locator('[data-card="0"]').bounding_box()
            right = page.locator('[data-card="2"]').bounding_box()
            check(right["x"] - left["x"] > 1440 * .6, "Gallery spreads across more than 60% of the viewport")
            check(page.locator(".story-statement").evaluate("(el)=>Number(getComputedStyle(el).opacity)>.99"), "Central statement fully visible during gallery stage")
            check(page.locator(".hero-copy").evaluate("(el)=>el.inert"), "Faded intro links are removed from keyboard order")
        page.wait_for_timeout(700)
    check(max(pinned_positions) - min(pinned_positions) < 2, "Stage stays pinned throughout the four sampled phases")
    check(page.locator(".story-decisions").evaluate("(el)=>!el.inert && getComputedStyle(el).opacity==='1'"), "Final service choices are visible and interactive")
    check(page.locator('[data-card="2"]').evaluate("(el)=>getComputedStyle(el).opacity==='0'"), "Gallery exits before final choices")
    seek(page, 0, 1600)
    check(page.locator('[data-card="2"]').evaluate("(el)=>getComputedStyle(el).transform") == initial, "Reverse scroll restores the original card transform")
    check(page.locator(".hero-copy").evaluate("(el)=>!el.inert && getComputedStyle(el).opacity==='1'"), "Reverse scroll restores the intro and CTA links")
    page.wait_for_timeout(800)
    seek(page, .49, 1600)
    page.wait_for_timeout(800)
    page.locator("#skip-hero").click()
    page.wait_for_timeout(1800)
    check(page.locator("#home-services").evaluate("(el)=>el===document.activeElement"), "Skip moves keyboard focus to services")
    check(page.locator("#home-services").bounding_box()["y"] < 160, "Skip exits the pinned scene into real page content")
    video_path = Path(page.video.path())
    context.close()

    for width, height in [(390, 844), (768, 900), (1440, 700)]:
        device = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="no-preference")
        device.goto(url)
        device.wait_for_function("scrollY === 0 && Number(document.querySelector('.hero-story').dataset.progress) === 0")
        for progress in [0, .2, .49, .95]:
            seek(device, progress, 1000)
            check(device.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"No overflow at {width}x{height}, phase {progress}")
            if width == 390 and progress in [.49, .95]:
                device.screenshot(path=str(ASSETS / f"hero-mobile-{'gallery' if progress == .49 else 'choices'}.png"))
        choice = device.locator(".wedding-choice")
        box = choice.bounding_box()
        check(box["y"] > 0 and box["y"] + box["height"] < height, f"Wedding choice fits viewport at {width}x{height}")
        check(device.locator(".corporate-choice").bounding_box()["y"] + device.locator(".corporate-choice").bounding_box()["height"] < height, f"Corporate choice fits viewport at {width}x{height}")
        choice.click()
        device.locator("#weddings").wait_for(state="visible")
        check(device.locator("#weddings").is_visible(), f"Scene CTA navigates at {width}px")
        device.goto(url)
        device.wait_for_function("scrollY === 0 && Number(document.querySelector('.hero-story').dataset.progress) === 0")
        seek(device, .49, 1000)
        device.emulate_media(reduced_motion="reduce")
        device.wait_for_function("!document.querySelector('.hero-story').classList.contains('is-animated')")
        check(device.locator(".hero-story").evaluate("(el)=>el.offsetHeight===el.querySelector('.hero-stage').offsetHeight"), f"Reduced motion removes scroll runway at {width}px")
        check(device.locator(".hero-copy").evaluate("(el)=>!el.inert && getComputedStyle(el).opacity==='1'"), f"Reduced motion restores content at {width}px")
        device.emulate_media(reduced_motion="no-preference")
        device.wait_for_function("document.querySelector('.hero-story').classList.contains('is-animated')")
        device.close()
    check(not errors, "No browser JavaScript errors")
    static_page = browser.new_page(viewport={"width": 390, "height": 600}, reduced_motion="no-preference")
    static_page.goto(url)
    check(not static_page.locator(".hero-story").evaluate("(el)=>el.classList.contains('is-animated')"), "Short phone viewport uses static, freely scrolling layout")
    static_page.close()
    no_js = browser.new_page(viewport={"width": 1440, "height": 900}, java_script_enabled=False)
    no_js.goto(url)
    check(no_js.locator(".hero-story").evaluate("(el)=>el.offsetHeight===el.querySelector('.hero-stage').offsetHeight"), "No-JavaScript view has no empty scroll runway")
    check(no_js.locator(".hero-copy").evaluate("(el)=>getComputedStyle(el).opacity==='1'"), "No-JavaScript hero remains visible")
    no_js.close()
    browser.close()

output = ROOT / "EVR-Scroll-Motion-Preview.mp4"
subprocess.run([
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video_path),
    "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", str(output),
], check=True)
metadata = json.loads(subprocess.run([
    "ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)
], check=True, capture_output=True, text=True).stdout)
check(14 <= float(metadata["format"]["duration"]) <= 40, "Motion recording duration is 14-40 seconds")
check(metadata["streams"][0]["width"] == 1440, "Motion recording width is 1440px")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
video_path.unlink()
recording_dir.rmdir()

sheet = Image.new("RGB", (1440, 1020), "#f4f0e8")
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 20)
for index, (name, label) in enumerate([
    ("01-intro", "01 / INTRO"),
    ("02-stack", "02 / GATHER"),
    ("03-gallery", "03 / EXPAND + REVEAL"),
    ("05-choices", "04 / CHOOSE YOUR WORLD"),
]):
    x, y = (index % 2) * 720, (index // 2) * 510
    image = Image.open(ASSETS / f"hero-step-{name}.png").resize((720, 450))
    sheet.paste(image, (x, y))
    draw.text((x + 20, y + 467), label, fill="#31433b", font=font)
sheet.save(ASSETS / "hero-motion-storyboard.png")
(ROOT / "motion-validation.json").write_text(json.dumps({
    "checks": checks, "passed": len(checks),
    "full_video_decode": "passed",
    "duration_seconds": float(metadata["format"]["duration"]),
    "audio": "none; actual browser motion capture"
}, indent=2), encoding="utf-8")
print(json.dumps({"file": str(output), "seconds": metadata["format"]["duration"], "passed": len(checks)}, indent=2))
