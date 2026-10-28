"""Validate the recording-inspired homepage and capture its actual interactions."""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
URL = (ROOT / "index.html").as_uri() + "#/home"
checks = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def seek(page, selector, stage_selector, progress):
    target = page.locator(selector).evaluate("""(el,args)=>{
      const stage=el.querySelector(args.stage);
      return el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top)+(el.offsetHeight-stage.offsetHeight)*args.progress;
    }""", {"stage": stage_selector, "progress": progress})
    page.evaluate("(top)=>scrollTo({top,behavior:'instant'})", target)
    page.wait_for_timeout(180)


def overflow(page, label):
    check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"No horizontal overflow: {label}")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height in [(1440, 900), (768, 900), (706, 768), (390, 844), (320, 740)]:
        page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=width <= 390, has_touch=width <= 390, reduced_motion="no-preference")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.wait_for_function("document.querySelector('.hero-story').dataset.progress==='0.0000'")
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        for progress, selector in [(.49, ".story-statement"), (.65, ".story-insights"), (.80, ".story-notes"), (.95, ".story-decisions")]:
            seek(page, ".hero-story", ".hero-stage", progress)
            check(page.locator(selector).evaluate("(el)=>Number(getComputedStyle(el).opacity)>.99"), f"{selector} fully visible at {width}px")
            overflow(page, f"{width}px / hero {progress}")
            if selector != ".story-statement":
                check(page.locator(selector).get_attribute("aria-hidden") == "false", f"Active {selector} is accessible at {width}px")
            if width in [1440, 390] and progress in [.65, .8]:
                page.screenshot(path=str(ASSETS / f"experience-{width}-{'perspective' if progress == .65 else 'notes'}.png"))
        pinned_positions = []
        for index in range(5):
            seek(page, "#process-story", ".process-stage", (index + .25) / 5)
            check(page.locator("#process-story").get_attribute("data-step") == str(index), f"Scroll selects phone step {index + 1} at {width}px")
            check(page.locator(".phone-screen:not([hidden])").count() == 1, "Exactly one phone screen is visible")
            check(page.locator(f'[data-phone-screen="{index}"]').is_visible(), "Phone screen matches active process step")
            check(page.locator('[data-process-step][aria-current="step"]').get_attribute("data-process-step") == str(index), "Process step exposes current state")
            pinned_positions.append(page.locator(".process-stage").bounding_box()["y"])
            phone = page.locator(".phone-shell").bounding_box()
            check(phone["y"] >= 75 and phone["y"] + phone["height"] <= height, f"Whole phone fits at {width}x{height}, step {index + 1}")
            overflow(page, f"{width}px / phone {index + 1}")
            if width in [1440, 390] and index == 3:
                page.screenshot(path=str(ASSETS / f"experience-{width}-phone.png"))
        check(max(pinned_positions) - min(pinned_positions) < 2, f"Process stage remains pinned at {width}px")
        seek(page, "#process-story", ".process-stage", .05)
        initial_phone = page.locator(".phone-shell").evaluate("(el)=>el.style.transform")
        initial_progress = page.locator(".process-progress span").evaluate("(el)=>el.style.transform")
        seek(page, "#process-story", ".process-stage", .10)
        check(page.locator("#process-story").get_attribute("data-step") == "0", "Continuous motion stays within the same logical step")
        check(page.locator(".phone-shell").evaluate("(el)=>el.style.transform") != initial_phone, "Phone tilt responds continuously to scrolling, not only to step changes")
        check(page.locator(".process-progress span").evaluate("(el)=>el.style.transform") != initial_progress, "Progress line follows continuous scroll position")
        seek(page, "#process-story", ".process-stage", .19)
        opacity = page.locator('[data-phone-screen="0"]').evaluate("(el)=>Number(getComputedStyle(el).opacity)")
        check(0 < opacity < 1, "Phone screens crossfade at scroll-driven transition positions")
        seek(page, "#process-story", ".process-stage", .05)
        check(page.locator(".phone-shell").evaluate("(el)=>el.style.transform") == initial_phone, "Reverse scroll restores the exact phone transform")
        page.locator('[data-process-step="1"]').click()
        page.wait_for_function("document.querySelector('#process-story').dataset.step==='1'")
        check(page.locator('[data-phone-screen="1"]').is_visible(), "Clicking a process step seeks the scroll scene")
        seek(page, "#process-story", ".process-stage", .05)
        check(page.locator("#process-story").get_attribute("data-step") == "0", "Reverse scroll restores the first phone screen")
        page.locator("#team-next").click()
        page.wait_for_timeout(650)
        check(page.locator("#team-position").inner_text() == "2 / 3", "Team next control selects second page")
        check(page.locator(".team-page").nth(0).evaluate("(el)=>el.inert"), "Offscreen team roles are inert")
        page.locator('[data-team-page="2"]').click()
        page.wait_for_timeout(650)
        check(page.locator("#team-next").is_disabled(), "Team carousel stops at final page")
        page.locator("#team-previous").focus()
        page.keyboard.press("Enter")
        check(page.locator("#team-position").inner_text() == "2 / 3", "Team carousel supports keyboard activation")
        page.wait_for_timeout(650)
        page.locator(".team-section").evaluate("(el)=>el.scrollIntoView({behavior:'instant',block:'center'})")
        overflow(page, f"{width}px / carousel")
        if width in [1440, 390]:
            page.screenshot(path=str(ASSETS / f"experience-{width}-team.png"))
        page.locator(".home-faq summary").nth(1).click()
        check(page.locator(".home-faq details").nth(1).get_attribute("open") is not None, "Homepage FAQ expands")
        overflow(page, f"{width}px / FAQ")
        check(not errors, f"No JavaScript errors during homepage interactions at {width}px")
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page.goto(URL)
    check(not page.locator("#process-story").evaluate("(el)=>el.classList.contains('is-pinned')"), "Reduced motion removes the phone scroll runway")
    page.locator('[data-process-step="4"]').click()
    check(page.locator('[data-phone-screen="4"]').is_visible(), "Reduced-motion process remains selectable")
    check(page.locator('[data-phone-screen="4"]').evaluate("(el)=>el.getAnimations().length===0"), "Reduced-motion phone has no entry animation")
    date = page.locator("#shoot-date")
    page.locator('#date-enquiry-form button[type="submit"]').click()
    check(page.locator("#continue-date-enquiry").is_hidden(), "Empty date cannot continue")
    date.fill("2000-01-01")
    page.locator('#date-enquiry-form button[type="submit"]').click()
    check(page.locator("#continue-date-enquiry").is_hidden(), "Past date cannot continue")
    date.fill("2099-06-15")
    page.locator("#date-service").select_option("Corporate / content")
    page.locator('#date-enquiry-form button[type="submit"]').click()
    check("Availability has not been checked" in page.locator("#date-enquiry-status").inner_text(), "Date result never falsely confirms availability")
    page.locator("#continue-date-enquiry").click()
    page.locator("#request").wait_for(state="visible")
    check(page.locator('#inquiry-form [name="date"]').input_value() == "2099-06-15", "Selected date carries into enquiry")
    check(page.locator("#service").input_value() == "Corporate / content", "Selected service carries into enquiry")
    page.goto(URL)
    page.wait_for_function("document.querySelector('#home').hidden===false")
    check(page.locator("video").evaluate_all("(videos)=>videos.every(v=>v.paused && !v.getAttribute('src'))"), "No sample video autoplays or loads a source on entry")
    first = page.locator(".home-projects .preview-media").nth(0)
    second = page.locator(".home-projects .preview-media").nth(1)
    first.locator(".preview-play").click()
    page.wait_for_function("document.querySelector('.home-projects video').currentTime>.1")
    check(first.locator("video").evaluate("(v)=>!v.paused && v.videoWidth===720"), "Original wedding sample actually decodes and plays")
    second.locator(".preview-play").click()
    page.wait_for_function("document.querySelectorAll('.home-projects video')[1].currentTime>.1")
    check(first.locator("video").evaluate("(v)=>v.paused && v.hidden"), "Starting another preview stops and hides the previous one")
    second.locator(".preview-close").click()
    check(second.locator(".preview-play").evaluate("(el)=>el===document.activeElement"), "Closing preview restores keyboard focus")
    voice = page.locator(".voice-grid .preview-media").first
    voice.locator(".preview-play").click()
    page.wait_for_function("document.querySelector('.voice-grid video').currentTime>.1")
    check(voice.locator("video").evaluate("(v)=>!v.paused"), "Testimonial placeholder supports genuine inline demo playback")
    page.evaluate("location.hash='/corporate'")
    page.locator("#corporate").wait_for(state="visible")
    check(page.locator("video").evaluate_all("(videos)=>videos.every(v=>v.paused)"), "Navigation stops all media")
    page.goto(URL)
    page.locator(".voice-grid details").first.locator("summary").click()
    check(page.locator(".voice-grid details").first.get_attribute("open") is not None, "Testimonial details expand")
    page.close()

    short = browser.new_page(viewport={"width": 390, "height": 600})
    short.goto(URL)
    check(not short.locator("#process-story").evaluate("(el)=>el.classList.contains('is-pinned')"), "Short phone uses natural scrolling instead of a cropped pin")
    short.locator('[data-process-step="3"]').click()
    check(short.locator('[data-phone-screen="3"]').is_visible(), "Short-phone process buttons still work")
    short.close()

    recording_dir = ASSETS / "experience-recording"
    recording_dir.mkdir(exist_ok=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(recording_dir), record_video_size={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto(URL)
    page.wait_for_timeout(1000)
    for index in [0, 1, 2]:
        page.locator(f'[data-select-card="{index}"]').focus()
        page.keyboard.press("Enter")
        page.wait_for_timeout(850)
    page.locator('[data-select-card="2"]').evaluate("(el)=>el.blur()")
    for phase in [.20, .49, .65, .80, .95]:
        target = page.locator(".hero-story").evaluate("""(el,p)=>{const s=el.querySelector('.hero-stage');return el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(s).top)+(el.offsetHeight-s.offsetHeight)*p}""", phase)
        page.evaluate("(top)=>scrollTo({top,behavior:'smooth'})", target)
        page.wait_for_timeout(1500)
    for selector in [".date-enquiry", ".home-projects", ".working-agreement"]:
        page.locator(selector).evaluate("(el)=>el.scrollIntoView({behavior:'smooth',block:'center'})")
        page.wait_for_timeout(1500)
    for index in range(5):
        target = page.locator("#process-story").evaluate("""(el,p)=>{const s=el.querySelector('.process-stage');return el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(s).top)+(el.offsetHeight-s.offsetHeight)*p}""", (index + .25) / 5)
        page.evaluate("(top)=>scrollTo({top,behavior:'smooth'})", target)
        page.wait_for_timeout(1300)
    page.locator(".team-section").evaluate("(el)=>el.scrollIntoView({behavior:'smooth',block:'center'})")
    page.wait_for_timeout(1400)
    page.locator("#team-next").click()
    page.wait_for_timeout(1000)
    voice = page.locator(".voice-grid .preview-media").first
    voice.locator(".preview-play").click()
    page.wait_for_timeout(1800)
    voice.locator(".preview-close").click()
    page.locator(".home-faq summary").first.click()
    page.wait_for_timeout(1000)
    page.locator(".estimate-invite").evaluate("(el)=>el.scrollIntoView({behavior:'smooth',block:'center'})")
    page.wait_for_timeout(1400)
    source = Path(page.video.path())
    context.close()
    browser.close()

output = ROOT / "EVR-Full-Homepage-Preview.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(output)], check=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
source.unlink()
recording_dir.rmdir()
(ROOT / "experience-validation.json").write_text(json.dumps({"passed": len(checks), "checks": checks, "video_decode": "passed"}, indent=2), encoding="utf-8")
print(json.dumps({"homepage_checks_passed": len(checks), "preview": str(output)}, indent=2))
