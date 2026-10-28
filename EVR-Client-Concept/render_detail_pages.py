"""Validate all dedicated pages and record real native-scroll interactions."""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
BASE = (ROOT / "index.html").as_uri()
ROUTES = ["weddings", "work", "process", "estimate", "services", "approach", "brand-work", "production-quote"]
CORPORATE = {"services", "approach", "brand-work", "production-quote"}
checks = []
errors = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def ready(page, route):
    page.goto(BASE + "#/" + route)
    page.locator("#" + route).wait_for(state="visible")
    page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")


def seek(page, progress):
    page.locator(".route:visible [data-chapter-story]").evaluate("""(el,p)=>{
      const stage=el.querySelector('.chapter-stage');
      scrollTo({top:el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top)+(el.offsetHeight-stage.offsetHeight)*p,behavior:'instant'});
    }""", progress)
    page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    page.wait_for_function("p=>Math.abs(Number(document.querySelector('.route:not([hidden]) [data-chapter-story]').dataset.progress)-p)<.002", arg=progress)


def geometry(page):
    return page.locator(".route:visible [data-chapter-story]").evaluate("""el=>{
      const stage=el.querySelector('.chapter-stage'), panel=el.querySelector('.is-current');
      const copy=panel.querySelector('.chapter-copy').getBoundingClientRect(), box=stage.getBoundingClientRect();
      const art=panel.querySelector('.chapter-art'), nav=el.querySelector('.chapter-tabs').getBoundingClientRect();
      return {step:Number(el.dataset.step),top:box.top,expected:parseFloat(getComputedStyle(stage).top),
        copy:{top:copy.top,bottom:copy.bottom,left:copy.left,right:copy.right},stageBottom:box.bottom,
        fits:copy.bottom<=box.bottom-32 && copy.top>=box.top && copy.left>=0 && copy.right<=innerWidth,
        controlsClear:innerWidth>700||(copy.top>=nav.bottom && art.getBoundingClientRect().bottom<=copy.top+1),
        transform:art.style.transform,meter:el.querySelector('.chapter-meter i').style.transform,
        available:el.querySelectorAll('.chapter-panel:not([inert])').length};
    }""")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height in [(1440, 900), (1024, 768), (768, 900), (390, 844), (320, 740)]:
        page = browser.new_page(viewport={"width": width, "height": height}, has_touch=width <= 700)
        page.on("pageerror", lambda error: errors.append(str(error)))
        for route in ROUTES:
            ready(page, route)
            check(page.locator(".route:visible").count() == 1, f"{width}/{route}: one visible page")
            check(page.locator(f"#{route} h1").count() == 1, f"{width}/{route}: dedicated page heading")
            check(page.locator(".experience-switch").get_attribute("data-active") == ("corporate" if route in CORPORATE else "home"), f"{width}/{route}: correct navigation world")
            check(page.locator(f'#main-nav a[href="#/{route}"]').get_attribute("aria-current") == "page", f"{width}/{route}: active navigation link")
            check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"{width}/{route}: no opening overflow")
            if width in [1440, 390]:
                page.wait_for_timeout(350)
                page.screenshot(path=str(ASSETS / f"detail-{route}-{width}.png"))
            scene = page.locator(f"#{route} [data-chapter-story]")
            if scene.count():
                pin = not (width <= 700 and height < 820) and height >= 760
                check(scene.evaluate("el=>el.classList.contains('is-chapter-pinned')") == pin, f"{width}/{route}: appropriate pin fallback")
                count = scene.locator(".chapter-panel").count()
                if pin:
                    states = []
                    for progress in [i/(count-1) for i in range(count)] + [0]:
                        seek(page, progress)
                        state = geometry(page)
                        states.append(state)
                        check(state["step"] == round(progress*(count-1)), f"{width}/{route}: scroll selects chapter {progress:.2f}")
                        check(abs(state["top"]-state["expected"])<2, f"{width}/{route}: stage stays pinned")
                        check(state["fits"] and state["controlsClear"], f"{width}/{route}: chapter readable without clipped controls: {state}")
                        check(state["available"] == 1, f"{width}/{route}: hidden chapters inert")
                        check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"{width}/{route}: no scene overflow")
                    check(states[0]["transform"] == states[-1]["transform"], f"{width}/{route}: reversing restores first artwork")
                    seek(page, .05)
                    one = geometry(page)
                    seek(page, .08)
                    two = geometry(page)
                    check(one["step"] == two["step"] and one["transform"] != two["transform"], f"{width}/{route}: continuous motion between chapter changes")
                    check(one["meter"] != two["meter"], f"{width}/{route}: continuously scrubbed progress")
                    scene.locator("[data-story-step]").last.focus()
                    page.keyboard.press("Enter")
                    page.wait_for_function("Number(document.querySelector('.route:not([hidden]) [data-chapter-story]').dataset.progress)>.998")
                    check(geometry(page)["step"] == count-1, f"{width}/{route}: keyboard chapter selection")
                    if width in [1440, 390]:
                        seek(page, 1/(count-1))
                        page.evaluate("document.activeElement.blur()")
                        page.screenshot(path=str(ASSETS / f"detail-{route}-{width}-scroll.png"))
                else:
                    check(scene.locator(".chapter-panel").evaluate_all("all=>all.every(el=>!el.inert && !el.hasAttribute('aria-hidden'))"), f"{width}/{route}: all static chapters readable")
                    scene.locator("[data-story-step]").last.click()
                    check(page.evaluate("document.activeElement.classList.contains('chapter-panel')"), f"{width}/{route}: static chapter button focuses content")
                skip = scene.locator(".chapter-footer [data-scroll-to]")
                target = skip.get_attribute("data-scroll-to")
                skip.click()
                page.wait_for_function("id=>document.activeElement.id===id", arg=target)
                check(page.locator("#" + target).evaluate("el=>el===document.activeElement"), f"{width}/{route}: skip exits with focus")
            for fraction in [.5, 1]:
                page.evaluate("p=>scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*p,behavior:'instant'})", fraction)
                page.wait_for_timeout(100)
                check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"{width}/{route}: lower content no overflow")
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda error: errors.append(str(error)))
    ready(page, "services")
    check(page.evaluate("""()=>{
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
      return ids.length===new Set(ids).size;
    }"""), "All IDs unique")
    check(page.evaluate("""()=>[...document.querySelectorAll('a[href^="#/"]')].every(a=>document.getElementById(a.hash.slice(2)))"""), "Every local route link resolves")
    for route in ["services", "approach", "brand-work", "production-quote"]:
        page.locator(f'#main-nav a[href="#/{route}"]').click()
        page.locator("#" + route).wait_for(state="visible")
        check(page.url.endswith("#/" + route), f"Corporate menu opens full {route} page")
    check(page.locator("#production-quote #estimate-calculator").count() == 1, "Corporate quote mounts shared calculator")
    check(page.locator("#estimate-type").input_value() == "corporate", "Corporate quote defaults to corporate pricing")
    check("Discussed on a call" in page.locator("#estimate-breakdown").inner_text() and "INR" not in page.locator("#estimate-breakdown").inner_text(), "Corporate public request has no prices")
    page.locator("#estimate-days").fill("2")
    check(page.locator("#estimate-breakdown dd").first.inner_text() == "2", "Corporate two-day scope")
    page.locator("#estimate-days").fill("0")
    check(page.locator("#estimate-request").is_disabled(), "Invalid production days block request")
    page.locator("#estimate-days").fill("2")
    page.locator("#estimate-request").click()
    check(page.locator("#request").is_visible() and page.locator("#service").input_value() == "Corporate / content", "Corporate quote carries service to enquiry")
    check("2 shoot day(s)" in page.locator('[name="brief"]').input_value() and "INR" not in page.locator('[name="brief"]').input_value(), "Corporate request carries scope, not prices, to enquiry")
    page.locator('[data-experience="home"]').click()
    page.locator('#main-nav a[href="#/estimate"]').click()
    page.locator("#estimate").wait_for(state="visible")
    check(page.locator("#estimate #estimate-calculator").count() == 1 and page.locator("#estimate-calculator").count() == 1, "Wedding quote reuses single calculator without duplicate IDs")
    page.locator("#estimate-days").fill("1")
    check(page.locator("#estimate-breakdown dd").all_text_contents() == ["1", "Requested", "1", "Discussed on a call"], "Wedding request shows scope with call-only pricing")
    page.locator("#estimate-outputs").fill("1.5")
    check(page.locator("#estimate-request").is_disabled(), "Fractional output quantities rejected")
    page.locator("#estimate-outputs").fill("1")
    check(not page.locator("#estimate-request").is_disabled(), "Valid input restores quote action")
    page.evaluate("document.querySelector('[name=brief]').value='Keep my custom requirements.'")
    page.locator("#estimate-request").click()
    check(page.locator('[name="brief"]').input_value() == "Keep my custom requirements.", "Custom enquiry brief is not overwritten")
    ready(page, "work")
    page.locator('#work [data-filter="prewedding"]').click()
    check(page.locator("#work [data-category]:visible").count() == 1, "Wedding story filter")
    page.locator('#work [data-project="prewedding"]').click()
    check(page.locator("#project-title").inner_text() == "Before the celebrations", "Wedding detail shows the selected story")
    page.keyboard.press("Escape")
    ready(page, "brand-work")
    page.locator('#brand-work [data-filter="reels"]').click()
    check(page.locator("#brand-work [data-category]:visible").count() == 1, "Brand work filter")
    page.locator('#brand-work [data-project="reels"]').click()
    check(page.locator("#project-title").inner_text() == "The detail that matters", "Brand detail matches selected work")
    page.keyboard.press("Escape")
    check(page.evaluate("document.activeElement.dataset.project==='reels'"), "Project close restores keyboard focus")
    ready(page, "work")
    check(page.locator('#work [data-filter="prewedding"]').get_attribute("aria-pressed") == "true", "Gallery filters stay independent across worlds")
    for route in ["weddings", "brand-work"]:
        ready(page, route)
        media = page.locator(f"#{route} [data-demo-media]")
        media.locator(".preview-play").click()
        page.wait_for_function("id=>document.querySelector('#'+id+' video').currentTime>.05", arg=route)
        check(media.locator("video").evaluate("v=>v.videoWidth>0 && !v.paused"), f"{route}: real decoded demo playback")
        page.evaluate("location.hash='/services'")
        page.wait_for_timeout(150)
        check(media.locator("video").evaluate("v=>v.hidden && v.paused"), f"{route}: route exit stops playback")
    for route in ["weddings", "process", "services", "approach"]:
        ready(page, route)
        seek(page, .7)
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_function("!document.querySelector('.route:not([hidden]) [data-chapter-story]').classList.contains('is-chapter-pinned')")
        check(page.locator(f"#{route} .chapter-panel").evaluate_all("all=>all.every(el=>!el.inert && !el.hasAttribute('aria-hidden'))"), f"{route}: live reduced-motion preference exposes all chapters")
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_function("document.querySelector('.route:not([hidden]) [data-chapter-story]').classList.contains('is-chapter-pinned')")
        seek(page, .1)
        check(geometry(page)["available"] == 1, f"{route}: animation restored live")
    page.close()
    check(not errors, f"No page script errors: {errors}")

    static = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    for route in ROUTES:
        ready(static, route)
        static.screenshot(path=str(ASSETS / f"detail-{route}-full.png"), full_page=True)
    static.close()

    folder = ASSETS / "detail-recording"
    context = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(folder), record_video_size={"width": 1440, "height": 900})
    page = context.new_page()
    for route in ROUTES:
        ready(page, route)
        page.wait_for_timeout(1000)
        scene = page.locator(f"#{route} [data-chapter-story]")
        if scene.count():
            seek(page, 0)
            page.wait_for_timeout(350)
            page.mouse.move(800, 500)
            travel = scene.evaluate("el=>el.offsetHeight-el.querySelector('.chapter-stage').offsetHeight")
            count = scene.locator(".chapter-panel").count()
            for step in range(1, count):
                for _ in range(12):
                    page.mouse.wheel(0, travel / (count-1) / 12)
                    page.wait_for_timeout(25)
                page.wait_for_timeout(450)
            for _ in range(12):
                page.mouse.wheel(0, -travel / 12)
                page.wait_for_timeout(25)
            page.wait_for_timeout(400)
        else:
            page.evaluate("scrollTo({top:750,behavior:'smooth'})")
            page.wait_for_timeout(1200)
        page.locator(f"#{route} .detail-end").evaluate("el=>el.scrollIntoView({behavior:'smooth',block:'center'})")
        page.wait_for_timeout(650)
    raw = Path(page.video.path())
    context.close()
    browser.close()
output = ROOT / "EVR-Dedicated-Pages-Preview.mp4"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(output)], check=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
raw.unlink()
folder.rmdir()
(ROOT / "detail-validation.json").write_text(json.dumps({"passed": len(checks), "checks": checks, "errors": errors}, indent=2), encoding="utf-8")
print(json.dumps({"dedicated_page_checks_passed": len(checks), "preview": str(output)}, indent=2))
