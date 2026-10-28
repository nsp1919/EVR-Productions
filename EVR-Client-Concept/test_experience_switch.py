"""Check the persistent experience switch and its two contextual menus."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
BASE = (ROOT / "index.html").as_uri()
checks = []
errors = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def settle(page, route):
    page.locator("#" + route).wait_for(state="visible")
    page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")


def menu(page):
    toggle = page.locator("#menu-toggle")
    if toggle.is_visible() and toggle.get_attribute("aria-expanded") != "true":
        toggle.click()


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height in [(1440, 900), (1200, 900), (1100, 900), (1024, 768), (768, 900), (706, 768), (390, 844), (320, 740)]:
        page = browser.new_page(viewport={"width": width, "height": height}, has_touch=width <= 700)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "#/home")
        settle(page, "home")
        check(page.locator('[data-experience="home"]').inner_text().strip() == "Wedding Photography", f"{width}: switch clearly names wedding photography")
        check(page.locator('[data-experience="corporate"]').inner_text().strip() == "Brand Video Production", f"{width}: switch clearly names brand video production")
        baseline_width = page.evaluate("document.documentElement.scrollWidth")
        for destination in ["corporate", "home", "corporate"]:
            control = page.locator(f'[data-experience="{destination}"]')
            check(control.is_visible(), f"{width}: {destination} switch outside menu")
            if width <= 700:
                control.tap()
            else:
                control.click()
            settle(page, destination)
            check(control.get_attribute("aria-current") == "page", f"{width}: selected switch is current page")
            check(page.locator(".experience-switch").get_attribute("data-active") == destination, f"{width}: correct switch position")
            check(page.locator(".route:visible").count() == 1, f"{width}: only selected route visible")
            check(page.locator("#menu-toggle").get_attribute("aria-expanded") == "false", f"{width}: switching closes mobile menu")
            check(page.locator(f'[data-nav-experience="{destination}"]').get_attribute("hidden") is None, f"{width}: correct menu active")
            check(page.locator('[data-nav-experience]:not([hidden])').count() == 1, f"{width}: only one menu active")
            check(page.evaluate("document.documentElement.scrollWidth") <= max(width, baseline_width), f"{width}: switching adds no document overflow")
            geometry = page.evaluate("""()=>{
              const header=document.querySelector('header').getBoundingClientRect();
              const brand=document.querySelector('header>.brand').getBoundingClientRect();
              const control=document.querySelector('.experience-switch').getBoundingClientRect();
              const nav=document.querySelector('#main-nav'), toggle=document.querySelector('#menu-toggle');
              const neighbour=(getComputedStyle(toggle).display!=='none'?toggle:nav).getBoundingClientRect();
              return {fits:control.left>=header.left && control.right<=header.right,
                noOverlap:brand.right<=control.left && control.right<=neighbour.left,
                sameRow:Math.abs(control.top-neighbour.top)<25};
            }""")
            check(all(geometry.values()), f"{width}: switch fits one row without overlap: {geometry}")
            if width in [1440, 390] and destination == "home":
                page.wait_for_timeout(300)
                page.screenshot(path=str(ROOT / "assets" / f"switch-{width}-home.png"))
        if width in [1440, 390]:
            page.wait_for_timeout(300)
            page.screenshot(path=str(ROOT / "assets" / f"switch-{width}-corporate.png"))
        for destination in ["services", "approach", "brand-work"]:
            menu(page)
            page.locator(f'#main-nav a[href="#/{destination}"]').click()
            settle(page, destination)
            check(page.locator("#menu-toggle").get_attribute("aria-expanded") == "false", f"{width}: page link closes menu")
            check(page.locator("#" + destination).is_visible(), f"{width}: dedicated {destination} page opens")
        menu(page)
        page.locator('#main-nav [data-estimate-type="corporate"]').click()
        settle(page, "production-quote")
        check(page.locator("#estimate-type").input_value() == "corporate", f"{width}: corporate navigation preselects estimate")
        check(page.locator('[data-nav-experience="corporate"]').get_attribute("hidden") is None, f"{width}: estimate retains corporate menu")
        check(page.locator("body").evaluate("el=>el.classList.contains('corporate-view')"), f"{width}: estimate retains corporate styling")
        page.reload()
        settle(page, "production-quote")
        check(page.locator(".experience-switch").get_attribute("data-active") == "corporate", f"{width}: reload keeps navigation context")
        menu(page)
        page.locator('#main-nav a[href="#/services"]').click()
        settle(page, "services")
        check(page.locator("#services").is_visible(), f"{width}: services page opens from production quote")
        if width <= 1100:
            menu(page)
        page.locator('[data-experience="home"]').click()
        settle(page, "home")
        menu(page)
        check(page.locator('#main-nav a:visible').all_text_contents() == ["Weddings", "Selected work", "Our process", "Build an estimate ↗"], f"{width}: home menu is distinct")
        page.locator('#main-nav [data-estimate-type="wedding"]').click()
        settle(page, "estimate")
        check(page.locator("#estimate-type").input_value() == "wedding", f"{width}: home estimate uses wedding defaults")
        check(page.locator(".experience-switch").get_attribute("data-active") == "home", f"{width}: home estimate keeps home menu")
        page.close()

    page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "#/home")
    settle(page, "home")
    page.locator('[data-experience="corporate"]').focus()
    page.keyboard.press("Enter")
    settle(page, "corporate")
    check(page.locator("#corporate").is_visible(), "Keyboard Enter switches to corporate")
    check(page.locator('#main-nav a:visible').all_text_contents() == ["Services", "Our approach", "Brand work", "Get a production quote ↗"], "Corporate menu has relevant labels only")
    check(page.locator(".experience-switch").evaluate("el=>getComputedStyle(el,'::before').transitionDuration==='0s'"), "Reduced motion disables switch animation")
    page.locator('#main-nav [data-estimate-type="corporate"]').click()
    settle(page, "production-quote")
    page.locator('[data-experience="home"]').click()
    settle(page, "home")
    page.go_back()
    settle(page, "production-quote")
    check(page.locator(".experience-switch").get_attribute("data-active") == "corporate", "History back restores corporate quote menu")
    page.go_forward()
    settle(page, "home")
    check(page.locator(".experience-switch").get_attribute("data-active") == "home", "History forward restores home menu")
    page.goto(BASE + "#/unknown")
    settle(page, "home")
    check(page.locator('[data-experience="home"]').get_attribute("aria-current") == "page", "Invalid route falls back to Home switch state")
    page.goto(BASE + "#corporate")
    settle(page, "corporate")
    check(page.locator(".experience-switch").get_attribute("data-active") == "corporate", "Legacy corporate hash remains supported")
    page.close()
    check(not errors, f"No script errors: {errors}")
    browser.close()

(ROOT / "switch-validation.json").write_text(json.dumps({"passed": len(checks), "checks": checks}, indent=2), encoding="utf-8")
print(json.dumps({"switch_and_navigation_checks_passed": len(checks)}, indent=2))
