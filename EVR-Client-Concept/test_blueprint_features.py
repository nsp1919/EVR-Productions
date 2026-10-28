"""Validate corporate-page features adapted from the supplied website blueprint."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
BASE = (ROOT / "index.html").as_uri()
checks = []
errors = []


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    checks.append(description)


def open_corporate(page):
    page.goto(BASE + "#/corporate")
    page.locator("#corporate").wait_for(state="visible")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height, reduced in [(1440, 900, False), (390, 844, False), (1440, 900, True)]:
        page = browser.new_page(
            viewport={"width": width, "height": height},
            reduced_motion="reduce" if reduced else "no-preference",
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        open_corporate(page)

        check(page.locator(".corp-hero-bg video[autoplay][loop][muted][playsinline]").count() == 1, "Corporate hero has a muted looping background video")
        check(page.locator(".corp-capability-grid article").count() == 8, "Eight production capability cards are present")
        capabilities = page.locator(".corp-capabilities")
        check("Excellence in" in capabilities.inner_text(), "Dedicated excellence-in-everything section is present")
        check(capabilities.locator(".corp-capabilities-badge").inner_text().endswith("PRODUCTION CAPABILITIES"), "Capability badge avoids unverified client project claims")
        columns = capabilities.locator(".corp-capability-grid").evaluate("el=>getComputedStyle(el).gridTemplateColumns.split(' ').length")
        check(columns == (1 if width == 390 else 2), f"{width}: capability grid uses the specified responsive columns")
        check(page.locator(".corp-funnel-steps article").count() == 3, "Hook, Nurture and Convert funnel stages are present")
        check(page.locator(".corp-reel-card[data-reel-card]").count() == 6, "Six reel preview cards are present")
        check(page.locator(".corp-marquee-track").count() == 1, "Production-tech marquee is present")
        check(page.locator(".corp-metric-grid [data-count]").count() == 4, "Four planning counters are present")
        check(page.locator(".corp-final-video[autoplay][loop][muted][playsinline]").count() == 1, "Final CTA has a muted looping background video")

        capabilities.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('.corp-capabilities').classList.contains('is-visible')")
        page.wait_for_function("document.querySelector('[data-capability-count]').textContent==='08'")
        check(capabilities.locator("[data-capability-count]").inner_text() == "08", f"{width}: verified count-up reflects the eight actual capabilities")
        card_border = capabilities.locator(".corp-capability-grid article").first.evaluate("el=>getComputedStyle(el).borderColor")
        check(card_border.startswith("rgba(255, 255, 255"), f"{width}: capability cards use the section-specific glass styling")
        if not reduced:
            check(capabilities.locator(".corp-capability-grid article").first.evaluate("el=>getComputedStyle(el).transitionDuration.includes('0.55s')"), "Capability cards use staggered entrance transitions")

        page.locator(".corp-funnel-steps article").nth(2).evaluate("""el=>{
          const rect=el.getBoundingClientRect();
          scrollTo(0,scrollY+rect.top+rect.height/2-innerHeight/2);
        }""")
        if not reduced:
            page.wait_for_function("document.querySelector('[data-funnel-stage=\"2\"]').getAttribute('aria-current')==='step'")
            check(page.locator(".corp-funnel-position").inner_text() == "03 / CONVERT", f"{width}: funnel updates its current stage on scroll")
        else:
            check(page.locator(".corp-funnel-steps article").count() == 3, "Reduced-motion mode keeps every funnel stage available")

        if width == 1440 and not reduced:
            check(page.locator("header").evaluate("el=>el.classList.contains('is-scrolled')"), "Sticky corporate header gains glass styling on scroll")
            card = page.locator(".corp-reel-card").first
            card.hover()
            page.wait_for_function("document.querySelector('.corp-reel-card').classList.contains('is-playing')")
            check(card.locator("video").get_attribute("src").endswith("demo-studio.mp4"), "Hover starts the local muted reel preview")
            card.click()
            check(page.locator("#corp-reel-dialog").is_visible(), "Selecting a reel opens the lightbox")
            check(page.locator("#corp-reel-dialog video").get_attribute("src").endswith("demo-studio.mp4"), "Lightbox uses the local motion sample")
            page.locator("[data-close-reel]").click()
            check(page.locator("#corp-reel-dialog").is_hidden(), "Lightbox closes with its close button")

            page.locator(".corp-metrics").scroll_into_view_if_needed()
            page.wait_for_function("Array.from(document.querySelectorAll('.corp-metric-grid [data-count]')).every(el=>el.textContent===el.dataset.count)")
            check(page.locator(".corp-metric-grid [data-count]").all_text_contents() == ["1", "3", "4", "0"], "Counters animate to declared planning facts")
            page.locator(".corp-faq summary").first.click()
            check(page.locator(".corp-faq details").first.get_attribute("open") is not None, "Corporate FAQ accordion opens")

        if reduced:
            check(page.locator(".corp-marquee-track").evaluate("el=>getComputedStyle(el).animationName==='none'"), "Reduced-motion mode stops the marquee")

        check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{width}: corporate page has no horizontal overflow")
        page.close()

    check(not errors, f"No browser errors: {errors}")
    browser.close()

(ROOT / "blueprint-validation.json").write_text(json.dumps({"passed": len(checks), "checks": checks}, indent=2), encoding="utf-8")
print(json.dumps({"blueprint_feature_checks_passed": len(checks)}, indent=2))
