"""Exercise contextual quotation entrypoints, item calculations and PDF content."""
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
BASE = (ROOT / "index.html").as_uri()
checks = []
errors = []


def check(value, label):
    assert value, label
    checks.append(label)

def no_prices(text):
    return not re.search(r"(?:INR|Rs\.?|\u20b9)\s*\d|\d{1,3}(?:,\d{2,3})+\.\d{2}", text)


def settle(page):
    page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")


def route(page, name):
    page.goto(BASE + "#/" + name)
    page.locator("#" + name).wait_for(state="visible")
    settle(page)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page.on("pageerror", lambda error: errors.append(str(error)))
    route(page, "home")
    floating = page.locator("#floating-quote")
    check(floating.inner_text().endswith("Wedding quote"), "Wedding floating label")
    floating.focus()
    page.keyboard.press("Enter")
    page.locator("#estimate").wait_for(state="visible")
    page.wait_for_function("document.activeElement.id==='wedding-quotation-builder'")
    check(floating.is_hidden(), "Floating CTA hidden while quoting")
    wedding = page.locator("#wedding-quotation-builder")
    check(wedding.evaluate("el=>el.getBoundingClientRect().top>=85 && el.getBoundingClientRect().top<140"), "Keyboard entry focuses and scrolls to detailed builder")
    check(wedding.locator('button[type="submit"]').is_disabled(), "Empty quote cannot preview")
    wedding.get_by_label("Client name", exact=True).fill("Example Client")
    wedding.get_by_label("Couple / celebration name", exact=True).fill("Example Celebration")
    wedding.locator('[data-event="5"]').check()
    event = wedding.locator("fieldset").filter(has=page.locator('legend:text-is("Wedding")'))
    event.locator('[data-days="5"]').select_option("2")
    days = event.locator(".builder-day")
    days.nth(0).locator('[data-item="photographer"]').fill("2")
    days.nth(1).locator('[data-item="cinema"]').fill("1")
    wedding.locator('[data-item="teaser"]').fill("1")
    check(no_prices(wedding.inner_text()) and "Pricing will be discussed on a call" in wedding.locator("output").inner_text(), "Wedding planner shows call guidance instead of prices")
    days.nth(0).get_by_label("Session / time window").select_option("both")
    check("2 selected item(s)" in wedding.locator("dl").inner_text(), "Per-day selected crew appears in summary")
    event.locator('[data-days="5"]').select_option("1")
    check("1 selected item(s)" in wedding.locator("dl").inner_text(), "Removing a day excludes its crew")
    event.locator('[data-days="5"]').select_option("2")
    check("2 selected item(s)" in wedding.locator("dl").inner_text(), "Restoring a day preserves its quantities")
    wedding.locator('[data-event="5"]').uncheck()
    check("Wedding" not in wedding.locator("dl").inner_text(), "Deselected event excluded from summary")
    wedding.locator('[data-event="5"]').check()
    for value in ["-1", "1.5", "", "21"]:
        wedding.locator('[data-item="teaser"]').fill(value)
        check(wedding.locator('button[type="submit"]').is_disabled(), f"Invalid quantity blocked: {value!r}")
    wedding.locator('[data-item="teaser"]').fill("1")
    wedding.locator('[data-event="9"]').check()
    wedding.locator('[data-days="9"]').select_option("2")
    check("Pre-wedding shoot" in wedding.locator("dl").inner_text() and no_prices(wedding.inner_text()), "Pre-wedding duration without package price")
    wedding.get_by_label("Additional requirements", exact=False).fill("Raw footage and album specifications to confirm.")
    wedding.locator('button[type="submit"]').click()
    check(page.locator("#quote-dialog").is_visible(), "Detailed preview opens")
    check(page.locator("#pdf-client").inner_text() == "Example Client", "Client reaches printed document")
    check("Day 2" in page.locator("#pdf-scope").inner_text(), "Day-level scope reaches printed document")
    check("Raw footage" in page.locator("#pdf-scope").inner_text(), "Unpriced requirements reach printed document")
    check("Pricing will be discussed on a call" in page.locator("#pdf-total").inner_text(), "Preview explains call-only pricing")
    check(page.locator("#quote-document th").all_text_contents() == ["Requested scope & deliverables", "Quantity"], "No price columns in customer preview")
    check(no_prices(page.locator("#quote-document").inner_text()), "No monetary amounts in customer preview")
    pdf = ROOT / "assets" / "detailed-wedding-quote-check.pdf"
    page.pdf(path=str(pdf), format="A4", print_background=True)
    text = "\n".join(sheet.extract_text() for sheet in PdfReader(pdf).pages)
    check("Pre-wedding shoot" in text and "Raw footage" in text and "discussed on a call" in text and no_prices(text), "Actual PDF contains scope and call guidance, with no prices")
    pdf.unlink()
    page.locator("#close-quote").click()
    route(page, "corporate")
    check(floating.inner_text().endswith("Brand quote"), "Corporate floating label")
    check(floating.evaluate("el=>getComputedStyle(el).backgroundColor") == "rgb(36, 93, 221)", "Corporate floating colour")
    floating.click()
    page.wait_for_function("document.activeElement.id==='corporate-quotation-builder'")
    corporate = page.locator("#corporate-quotation-builder")
    check(corporate.locator('button[type="submit"]').is_disabled(), "Corporate quote starts independently")
    check(corporate.locator('[data-item="album25"]').count() == 0, "No wedding catalogue in corporate planner")
    corporate.get_by_label("Client name", exact=True).fill("Example Brand")
    corporate.locator('[data-event="0"]').check()
    corporate.locator("fieldset").first.locator('.builder-day').first.locator('[data-item="camera"]').fill("2")
    corporate.locator('[data-item="reel"]').fill("3")
    check("3 requested" in corporate.locator("dl").inner_text() and no_prices(corporate.inner_text()), "Corporate outputs appear without prices")
    corporate.locator('button[type="submit"]').click()
    check("BRAND" in page.locator("#pdf-ref").inner_text(), "Corporate PDF reference is distinct")
    check("Wedding" not in page.locator("#pdf-rows").inner_text(), "Corporate PDF contains only its scope")
    check(no_prices(page.locator("#quote-document").inner_text()), "Corporate preview excludes prices")
    page.locator("#close-quote").click()
    corporate.get_by_role("button", name="Discuss this scope").click()
    page.locator("#request").wait_for(state="visible")
    check("discussed on a call" in page.locator('[name="brief"]').input_value() and no_prices(page.locator('[name="brief"]').input_value()), "Enquiry contains requirements and no prices")
    check(page.locator("#service").input_value() == "Corporate / content", "Corporate enquiry type")
    route(page, "estimate")
    check("Pre-wedding shoot" in wedding.locator("dl").inner_text(), "Wedding state survived corporate navigation")
    wedding.get_by_role("button", name="Discuss this scope").click()
    check("existing enquiry brief was kept" in wedding.locator('[role="status"]').inner_text(), "Existing brief never overwritten")
    route(page, "studio")
    page.locator("#preview-quote").click()
    check(page.locator("#pdf-scope").inner_text() == "", "Legacy staff preview clears detailed scope")
    check("57,000.00" in page.locator("#pdf-total").inner_text(), "Legacy staff total unchanged")
    page.locator("#close-quote").click()
    route(page, "estimate")
    wedding.locator('button[type="submit"]').click()
    check(no_prices(page.locator("#quote-document").inner_text()) and page.locator("#quote-document th").count() == 2, "Staff preview cannot leak prices into the next customer PDF")
    page.locator("#close-quote").click()
    page.reload()
    settle(page)
    route(page, "production-quote")
    check(corporate.locator('button[type="submit"]').is_disabled(), "Reload clears in-tab customer state as documented")
    check(page.locator("[data-rate-label], #detailed-rate-editor").count() == 0, "Detailed public rate catalogue removed")
    for width, height in [(1440, 900), (768, 900), (390, 844), (320, 740)]:
        page.set_viewport_size({"width": width, "height": height})
        for destination, context in [("home", "wedding"), ("corporate", "corporate")]:
            route(page, destination)
            check(floating.is_visible(), f"{width}: floating entry visible for {context}")
            check(floating.evaluate("el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.height>=44}"), f"{width}: floating button fits and meets touch size")
            if width in [1440, 390]:
                page.screenshot(path=str(ROOT / "assets" / f"floating-quote-{context}-{width}.png"))
            route(page, "estimate" if context == "wedding" else "production-quote")
            builder = page.locator(f"#{context}-quotation-builder")
            builder.locator('[data-event="0"]').check()
            builder.scroll_into_view_if_needed()
            check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"{width}/{context}: no document overflow with expanded event")
            check(builder.locator(".builder-summary").evaluate("el=>el.scrollWidth<=el.clientWidth"), f"{width}/{context}: summary fits")
            if width in [1440, 390]:
                builder.evaluate("el=>el.scrollIntoView({block:'start',behavior:'instant'})")
                settle(page)
                page.screenshot(path=str(ROOT / "assets" / f"detailed-quote-{context}-{width}.png"))
            check(floating.is_hidden(), f"{width}/{context}: no floating obstruction on form")
            check(no_prices(page.locator(".route:visible").inner_text()), f"{width}/{context}: entire public quote page has no prices")
    check(not errors, f"No JavaScript errors: {errors}")
    browser.close()

print(json.dumps({"quotation_checks_passed": len(checks)}, indent=2))
