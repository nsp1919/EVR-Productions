"""Validate the corporate route and record its real, reversible scroll sequence."""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
BASE = (ROOT / "index.html").as_uri()
checks = []
errors = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def ready(page, route="corporate"):
    page.goto(BASE + "#/" + route)
    page.locator("#" + route).wait_for(state="visible")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")


def seek(page, progress):
    page.evaluate("""p=>{
      const el=document.querySelector('#corp-services'), stage=el.querySelector('.corp-service-stage');
      scrollTo({top:el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top)+(el.offsetHeight-stage.offsetHeight)*p,behavior:'instant'});
    }""", progress)
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    page.wait_for_function("p=>Math.abs(Number(document.querySelector('#corp-services').dataset.progress)-p)<.002", arg=progress)


def pin_state(page):
    return page.locator("#corp-services").evaluate("""el=>{
      const stage=el.querySelector('.corp-service-stage'), panel=el.querySelector('.is-current');
      const rect=stage.getBoundingClientRect(), art=panel.querySelector('.corp-service-art');
      const copy=panel.querySelector('.corp-service-copy').getBoundingClientRect();
      return {top:rect.top,bottom:rect.bottom,expected:parseFloat(getComputedStyle(stage).top),
        service:Number(el.dataset.service),transform:art.style.transform,progress:Number(el.dataset.progress),
        copyFits:copy.top>=rect.top && copy.bottom<=rect.bottom && copy.left>=0 && copy.right<=innerWidth,
        selected:el.querySelectorAll('[aria-current="true"]').length,
        available:el.querySelectorAll('.corp-service-panel:not([inert])').length,
        line:el.querySelector('.corp-service-meter i').style.transform};
    }""")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height in [(1440, 900), (1024, 768), (768, 900), (706, 768), (390, 844), (320, 740)]:
        page = browser.new_page(viewport={"width": width, "height": height}, has_touch=width <= 700)
        page.on("pageerror", lambda error: errors.append(str(error)))
        ready(page)
        check(page.locator("body").evaluate("el=>el.classList.contains('corporate-view')"), f"{width}: corporate route theme")
        check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{width}: hero no overflow")
        check(page.locator("#corporate h1").count() == 1, f"{width}: one corporate heading")
        if width in [1440, 390]:
            page.screenshot(path=str(ASSETS / f"corporate-{width}-hero.png"))
        check(page.locator("#corp-services").evaluate("el=>el.classList.contains('is-pinned')"), f"{width}: services pin enabled")
        check(page.locator(".corp-service-panels").evaluate("el=>getComputedStyle(el).overflow==='clip'"), f"{width}: passing art cannot cover service navigation or skip")
        states = []
        for progress in [0, 1/3, 2/3, 1, 2/3, 1/3, 0]:
            seek(page, progress)
            state = pin_state(page)
            states.append(state)
            check(state["service"] == round(progress * 3), f"{width}: correct service at {progress:.3f}")
            check(abs(state["top"] - state["expected"]) < 2, f"{width}: stage pinned at {progress:.3f}")
            check(state["bottom"] <= height + 1, f"{width}: stage fits viewport")
            check(state["copyFits"], f"{width}: active copy and CTA stay inside stage at {progress:.3f}")
            check(state["selected"] == state["available"] == 1, f"{width}: only current service accessible")
            check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{width}: no service overflow")
            if width in [1440, 390] and len(states) == 2:
                page.screenshot(path=str(ASSETS / f"corporate-{width}-services.png"))
        check(states[0]["transform"] == states[-1]["transform"], f"{width}: reverse scroll restores artwork")
        seek(page, .20)
        first = pin_state(page)
        seek(page, .22)
        second = pin_state(page)
        check(first["service"] == second["service"] and first["transform"] != second["transform"], f"{width}: continuous artwork motion within one service")
        check(first["line"] != second["line"], f"{width}: progress follows continuous scroll")
        page.locator('[data-corp-service="3"]').click()
        page.wait_for_function("Number(document.querySelector('#corp-services').dataset.progress)>.998")
        check(pin_state(page)["service"] == 3, f"{width}: service buttons seek scroll")
        page.locator('[data-corp-jump="corp-approach"]').click()
        page.wait_for_function("document.activeElement.id==='corp-approach'")
        page.wait_for_timeout(900)
        check(page.locator("#corp-approach").evaluate("el=>el.getBoundingClientRect().top>=0 && el.getBoundingClientRect().top<160"), f"{width}: skip scrolls to approach")
        for selector in [".corp-bento", ".corp-reel-section", ".corp-work", ".corp-production-band", ".corp-proof", ".corp-faq", ".corp-final"]:
            page.locator(selector).evaluate("el=>el.scrollIntoView({behavior:'instant',block:'center'})")
            page.wait_for_timeout(700)
            check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{width}: no overflow in {selector}")
            if width in [1440, 390] and selector in [".corp-bento", ".corp-reel-section", ".corp-work"]:
                page.screenshot(path=str(ASSETS / f"corporate-{width}-{selector[6:]}.png"))
        page.locator(".corp-faq summary").first.click()
        check(page.locator(".corp-faq details").first.get_attribute("open") is not None, f"{width}: FAQ opens")
        page.locator('#corporate [data-project="reels"]').click()
        check(page.locator("#project-dialog").is_visible(), f"{width}: reel brief opens")
        check(page.locator("#project-title").inner_text() == "The detail that matters", f"{width}: correct reel brief")
        page.keyboard.press("Escape")
        check(page.evaluate("document.activeElement.dataset.project==='reels'"), f"{width}: project dialog restores focus")
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda error: errors.append(str(error)))
    ready(page)
    page.locator('[data-corp-jump="corp-services"]').click()
    page.wait_for_timeout(1000)
    check(abs(pin_state(page)["top"] - 108) < 2, "Hero explore button enters pinned services")
    page.locator('[data-corp-service="2"]').focus()
    page.keyboard.press("Enter")
    page.wait_for_function("Math.abs(Number(document.querySelector('#corp-services').dataset.progress)-2/3)<.002")
    check(pin_state(page)["service"] == 2, "Keyboard Enter seeks YouTube")
    page.locator('[data-corp-service="1"]').focus()
    page.keyboard.press("Space")
    page.wait_for_function("Math.abs(Number(document.querySelector('#corp-services').dataset.progress)-1/3)<.002")
    check(pin_state(page)["service"] == 1, "Keyboard Space seeks reels")
    page.locator('#corp-reels-panel [data-service]').click()
    check(page.locator("#service").input_value() == "Marketing reels", "Reel enquiry carries correct service")
    check(page.locator("#request").is_visible(), "Reel enquiry routes correctly")
    check(page.locator("body").evaluate("el=>el.classList.contains('corporate-view')"), "Corporate navigation stays with its enquiry")
    ready(page)
    page.locator('[data-corp-estimate]').click()
    check(page.locator("#estimate-type").input_value() == "corporate", "Corporate estimate preselected")
    check("Discussed on a call" in page.locator("#estimate-breakdown").inner_text() and "INR" not in page.locator("#estimate-breakdown").inner_text(), "Corporate request shows call-only pricing")
    ready(page)
    players = page.locator('#corporate [data-demo-media]')
    check(players.count() == 1, "Corporate showreel demo media placement")
    container = players.first
    container.locator(".preview-play").click()
    container.locator("video").wait_for(state="visible")
    page.wait_for_function("document.querySelector('#corporate [data-demo-media] video').currentTime>.05")
    check(container.locator("video").evaluate("v=>!v.paused && v.videoWidth>0"), "Showreel demo: real decoded playback")
    container.locator(".preview-close").click()
    check(container.locator(".preview-play").evaluate("el=>el===document.activeElement"), "Showreel close restores focus")
    reel = page.locator("#corporate [data-reel-card]").first
    reel.hover()
    page.wait_for_function("document.querySelector('#corporate [data-reel-card]').classList.contains('is-playing')")
    check(reel.locator("video").evaluate("v=>!v.paused && v.videoWidth>0"), "Reel hover preview decodes and plays")
    reel.click()
    page.locator("#corp-reel-dialog").wait_for(state="visible")
    check(page.locator("#corp-reel-dialog video").evaluate("v=>!v.paused && v.videoWidth>0"), "Reel lightbox decodes and plays")
    page.locator("[data-close-reel]").click()
    check(page.locator("#corp-reel-dialog").is_hidden(), "Reel lightbox closes")
    reel.locator("video").evaluate("v=>v.pause()")
    container.locator(".preview-play").click()
    page.evaluate("location.hash='/home'")
    page.wait_for_timeout(200)
    check(page.locator("#corporate [data-demo-media] video").evaluate("v=>v.paused && v.hidden"), "Route away resets corporate showreel player")
    check(page.locator("#corporate .corp-hero-bg video").evaluate("v=>v.paused"), "Route away pauses ambient hero video")
    check(page.locator(".hero-story").evaluate("el=>el.classList.contains('is-animated')"), "Homepage hero remains animated")
    ready(page)
    seek(page, .65)
    check(pin_state(page)["service"] == 2, "Returning to corporate restores working scroll animation")
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(100)
    check(not page.locator("#corp-services").evaluate("el=>el.classList.contains('is-pinned')"), "Live reduced-motion change removes runway")
    check(page.locator(".corp-service-panel").evaluate_all("all=>all.every(el=>!el.inert && !el.hasAttribute('aria-hidden'))"), "Reduced motion exposes all service content")
    check(page.locator(".corp-hero-media").get_attribute("style") is None, "Reduced motion clears hero transform")
    page.locator('[data-corp-service="3"]').click()
    check(page.locator("#corp-podcast-panel").evaluate("el=>el===document.activeElement"), "Static service navigation moves focus")
    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_function("document.querySelector('#corp-services').classList.contains('is-pinned')")
    seek(page, .3)
    check(pin_state(page)["available"] == 1, "Motion restored live")
    page.set_viewport_size({"width": 390, "height": 667})
    page.wait_for_timeout(100)
    check(not page.locator("#corp-services").evaluate("el=>el.classList.contains('is-pinned')"), "Short phone uses all-content static layout")
    page.set_viewport_size({"width": 1280, "height": 600})
    page.wait_for_timeout(100)
    check(not page.locator("#corp-services").evaluate("el=>el.classList.contains('is-pinned')"), "Short desktop uses static layout")
    page.close()

    static = browser.new_page(viewport={"width": 390, "height": 844}, java_script_enabled=False)
    static.goto(BASE)
    static.locator("#home").evaluate("el=>el.hidden=true")
    static.locator("#corporate").evaluate("el=>el.hidden=false")
    check(static.locator(".corp-service-panel").evaluate_all("all=>all.every(el=>el.offsetHeight>0 && !el.inert)"), "No-JS corporate service content remains readable when route is exposed")
    check(static.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Isolated no-JS corporate layout no overflow")
    static.close()
    check(not errors, f"No JavaScript errors: {errors}")
    static = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    ready(static)
    static.screenshot(path=str(ASSETS / "corporate-full-layout.png"), full_page=True)
    static.close()

    recording_dir = ASSETS / "corporate-recording"
    context = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(recording_dir), record_video_size={"width": 1440, "height": 900})
    page = context.new_page()
    ready(page)
    page.wait_for_timeout(1400)
    page.locator(".corp-hero .preview-play").click()
    page.wait_for_timeout(1700)
    page.locator(".corp-hero .preview-close").click()
    page.locator('[data-corp-jump="corp-services"]').click()
    page.wait_for_timeout(1200)
    page.mouse.move(750, 470)
    for progress in [1/3, 2/3, 1, 2/3, 1/3, 0]:
        target = page.evaluate("""p=>{
          const el=document.querySelector('#corp-services'), stage=el.querySelector('.corp-service-stage');
          return el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top)+(el.offsetHeight-stage.offsetHeight)*p;
        }""", progress)
        delta = target - page.evaluate("scrollY")
        for _ in range(15):
            page.mouse.wheel(0, delta / 15)
            page.wait_for_timeout(30)
        page.wait_for_timeout(850)
    page.locator('[data-corp-jump="corp-approach"]').click()
    page.wait_for_timeout(1400)
    for selector in [".corp-bento", ".corp-reel-section", ".corp-work", ".corp-production-band", ".corp-proof", ".corp-faq", ".corp-final"]:
        page.locator(selector).evaluate("el=>el.scrollIntoView({behavior:'smooth',block:'center'})")
        page.wait_for_timeout(1450)
    video = Path(page.video.path())
    context.close()
    browser.close()

output = ROOT / "EVR-Corporate-Scroll-Preview.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(output)], check=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
video.unlink()
recording_dir.rmdir()
(ROOT / "corporate-validation.json").write_text(json.dumps({"checks": checks, "passed": len(checks), "errors": errors}, indent=2), encoding="utf-8")
print(json.dumps({"checks_passed": len(checks), "preview": str(output)}, indent=2))
