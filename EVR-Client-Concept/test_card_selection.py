"""Exercise real card hit targets, swapping and the existing scroll timeline."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
checks = []


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    checks.append(description)


def exposed_point(page, index):
    return page.locator(f'[data-select-card="{index}"]').evaluate("""button => {
      const rect=button.getBoundingClientRect();
      for (const fy of [.5,.3,.7,.15,.85]) {
        for (const fx of [.15,.85,.3,.7,.5]) {
          const x=rect.x+rect.width*fx, y=rect.y+rect.height*fy;
          if (x>0 && x<innerWidth && y>0 && y<innerHeight && document.elementFromPoint(x,y)===button) return {x,y};
        }
      }
      return null;
    }""")


def assert_front(page, index):
    page.wait_for_function("(i)=>document.querySelector(`[data-card=\"${i}\"]`).dataset.slot==='2'", arg=index)
    check(page.locator('.card-select[aria-pressed="true"]').count() == 1, "Exactly one card is selected")
    check(page.locator(f'[data-select-card="{index}"]').get_attribute("aria-pressed") == "true", f"Card {index} reports selected state")
    front_z = page.locator(f'[data-card="{index}"]').evaluate("(el)=>Number(getComputedStyle(el).zIndex)")
    check(all(front_z > page.locator(f'[data-card="{other}"]').evaluate("(el)=>Number(getComputedStyle(el).zIndex)") for other in range(3) if other != index), f"Card {index} is visually above the other two")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width, height, reduced in [(1440, 900, False), (390, 844, False), (390, 600, False), (1440, 900, True)]:
        touch = width == 390
        page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch, has_touch=touch, reduced_motion="reduce" if reduced else "no-preference")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto((ROOT / "index.html").as_uri() + "#/home")
        page.wait_for_function("document.querySelector('.hero-story').classList.contains('can-select-cards')")
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        assert_front(page, 2)
        animated = page.locator(".hero-story").evaluate("(el)=>el.classList.contains('is-animated')")
        for index in [0, 1, 2]:
            old_front = int(page.locator('.scene-card[data-slot="2"]').get_attribute("data-card"))
            old_slot = page.locator(f'[data-card="{index}"]').get_attribute("data-slot")
            third = next(i for i in range(3) if i not in [index, old_front])
            third_before = page.locator(f'[data-card="{third}"]').evaluate("(el)=>getComputedStyle(el).transform")
            card = page.locator(f'[data-card="{index}"]')
            before = card.evaluate("(el)=>({transform:getComputedStyle(el).transform,left:getComputedStyle(el).left})")
            point = exposed_point(page, index)
            check(point is not None, f"Back card {index} has a real exposed hit target at {width}x{height}")
            if touch:
                page.touchscreen.tap(point["x"], point["y"])
            else:
                page.mouse.click(point["x"], point["y"])
            assert_front(page, index)
            check(page.locator(f'[data-card="{old_front}"]').get_attribute("data-slot") == old_slot, "Previous front moves into the clicked card's old slot")
            page.wait_for_timeout(90)
            middle = card.evaluate("(el)=>({transform:getComputedStyle(el).transform,left:getComputedStyle(el).left})")
            transitions = card.evaluate("(el)=>el.getAnimations().filter(a=>a.playState==='running').map(a=>a.transitionProperty)")
            if reduced:
                check(not transitions, "Reduced-motion selection has no active animation")
            else:
                check("transform" in transitions, "Card swap animates its transform")
                if not animated:
                    check("left" in transitions, "Static short-phone layout also animates position")
            page.wait_for_timeout(700)
            after = card.evaluate("(el)=>({transform:getComputedStyle(el).transform,left:getComputedStyle(el).left})")
            if not reduced:
                check(middle["transform"] != before["transform"] and middle["transform"] != after["transform"], "Swap has a measurable intermediate transform, not an instant jump")
                if not animated:
                    check(middle["left"] != before["left"] and middle["left"] != after["left"], "Static swap has a measurable intermediate position")
            else:
                check(middle == after, "Reduced-motion selection moves directly to its final state")
            check(page.locator(f'[data-card="{third}"]').evaluate("(el)=>getComputedStyle(el).transform") == third_before, "Third card stays in place")
            check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Card swap does not cause horizontal overflow")
        page.locator('[data-select-card="0"]').focus()
        page.keyboard.press("Enter")
        assert_front(page, 0)
        page.wait_for_timeout(700)
        page.locator('[data-select-card="1"]').focus()
        page.keyboard.press("Space")
        assert_front(page, 1)
        page.wait_for_timeout(700)
        check("BRAND FILMS" in page.locator("#card-selection-status").inner_text(), "Selection is announced in the live status")
        state_before = page.locator("[data-slot]").evaluate_all("(cards)=>cards.map(el=>el.dataset.slot)")
        page.keyboard.press("Space")
        check(page.locator("[data-slot]").evaluate_all("(cards)=>cards.map(el=>el.dataset.slot)") == state_before, "Clicking the current front card does not rearrange the stack")
        for index in [2, 0, 2, 1, 0, 1]:
            page.locator(f'[data-select-card="{index}"]').focus()
            page.keyboard.press("Enter")
            page.wait_for_timeout(45)
        page.wait_for_timeout(700)
        assert_front(page, 1)
        check(sorted(page.locator("[data-slot]").evaluate_all("(cards)=>cards.map(el=>Number(el.dataset.slot))")) == [0, 1, 2], "Rapid swaps preserve exactly one card per slot")
        if width == 1440 and not reduced:
            before = page.locator('[data-card="1"]').evaluate("(el)=>getComputedStyle(el).transform")
            bounds = page.locator(".hero-story").evaluate("""el=>{const stage=el.querySelector('.hero-stage');return {start:el.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(stage).top),travel:el.offsetHeight-stage.offsetHeight}}""")
            page.evaluate("(y)=>scrollTo(0,y)", bounds["start"] + bounds["travel"] * .49)
            page.wait_for_function("Number(document.querySelector('.hero-story').dataset.progress)>.48")
            check(page.locator(".card-select:disabled").count() == 3, "Card selection is disabled during the scroll gallery")
            check(page.locator(".story-statement").evaluate("(el)=>Number(getComputedStyle(el).opacity)>.99"), "Gallery still reveals the central statement after swapping")
            page.evaluate("scrollTo(0,0)")
            page.wait_for_function("Number(document.querySelector('.hero-story').dataset.progress)===0")
            assert_front(page, 1)
            check(page.locator('[data-card="1"]').evaluate("(el)=>getComputedStyle(el).transform") == before, "Reverse scroll restores the chosen front card's exact position")
            page.screenshot(path=str(ROOT / "assets" / "hero-card-selected.png"))
            page.emulate_media(reduced_motion="reduce")
            page.wait_for_function("!document.querySelector('.hero-story').classList.contains('is-animated')")
            assert_front(page, 1)
            check(page.locator(".card-select:enabled").count() == 3, "Reduced-motion mode keeps card selection usable")
        page.evaluate("location.hash='/weddings'")
        page.locator("#weddings").wait_for(state="visible")
        page.evaluate("location.hash='/home'")
        page.locator("#home").wait_for(state="visible")
        page.wait_for_function("scrollY===0 && document.querySelector('.hero-story').classList.contains('can-select-cards')")
        assert_front(page, 1)
        check(page.locator(".card-select:enabled").count() == 3, "Returning to the home route preserves usable card selection")
        check(not errors, f"No browser errors at {width}x{height}")
        page.close()
    browser.close()

(ROOT / "card-selection-validation.json").write_text(json.dumps({"passed": len(checks), "checks": checks}, indent=2), encoding="utf-8")
print(json.dumps({"card_selection_checks_passed": len(checks)}, indent=2))
