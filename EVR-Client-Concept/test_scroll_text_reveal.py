"""Check the two selected homepage story panels' scroll-linked word reveals."""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = Path(__file__).resolve().with_name("index.html").as_uri() + "#/home"
INSIGHTS = ".hero-story .story-insights .scroll-word"
DECISIONS = ".hero-story .story-decisions .scroll-word"
checks = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def set_story_progress(page, progress):
    page.evaluate(
        """progress => {
          const story = document.querySelector('.hero-story');
          const stage = story.querySelector('.hero-stage');
          const top = parseFloat(getComputedStyle(stage).top) || 0;
          const start = story.getBoundingClientRect().top + scrollY - top;
          const travel = Math.max(1, story.offsetHeight - stage.offsetHeight);
          scrollTo({top: start + travel * progress, behavior: 'instant'});
        }""",
        progress,
    )
    page.wait_for_function(
        "Math.abs(Number(document.querySelector('.hero-story').dataset.progress) - "
        f"{progress}) < 0.01"
    )
    return page.evaluate("scrollY")


def revealed_count(page, selector):
    return page.locator(selector).evaluate_all(
        "words => words.filter(word => Number(word.style.opacity) > 0.89).length"
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    errors = []

    for width, height in [(1440, 900), (834, 661), (390, 844)]:
        page = browser.new_page(
            viewport={"width": width, "height": height},
            reduced_motion="no-preference",
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="load")
        page.wait_for_function(
            "document.querySelector('.hero-story').classList.contains('is-animated') && "
            "document.querySelector('.story-insights .scroll-word') && "
            "document.querySelector('.story-decisions .scroll-word')"
        )
        page.wait_for_timeout(100)

        insight_count = page.locator(INSIGHTS).count()
        decision_count = page.locator(DECISIONS).count()
        check(insight_count > 30, f"{width}px insights text wraps word by word")
        check(decision_count > 25, f"{width}px decisions text wraps word by word")
        check(
            page.locator(".hero-story .scroll-word").count()
            == insight_count + decision_count,
            f"{width}px only the two selected hero panels receive word reveals",
        )
        check(
            page.locator("#home > [data-scroll-word-group], #weddings .scroll-word").count()
            == 0,
            f"{width}px no other homepage or wedding text gets the new effect",
        )

        if width in (1440, 834):
            set_story_progress(page, 0.63)
            insight_early = revealed_count(page, INSIGHTS)
            set_story_progress(page, 0.70)
            insight_late = revealed_count(page, INSIGHTS)
            check(0 < insight_early < insight_late < insight_count,
                  f"Insights words brighten progressively with hero scroll "
                  f"({insight_early}, {insight_late}, {insight_count})")
            insight_cards = page.locator(".story-insights .insight-grid article")
            set_story_progress(page, 0.63)
            side_positions = insight_cards.evaluate_all(
                "cards => cards.map(card => card.getBoundingClientRect().left)"
            )
            side_opacity = insight_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(side_opacity[0] > 0 and side_opacity[0] < 1
                  and side_opacity[1] == 0,
                  f"{width}px the first insight card enters before the second")
            set_story_progress(page, 0.68)
            first_settled_position = insight_cards.first.evaluate(
                "card => card.getBoundingClientRect().left"
            )
            settled_opacity = insight_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            set_story_progress(page, 0.72)
            second_arrival = insight_cards.evaluate_all(
                "cards => cards.map(card => ({opacity:Number(card.style.opacity), "
                "left:card.getBoundingClientRect().left}))"
            )
            set_story_progress(page, 0.75)
            final_positions = insight_cards.evaluate_all(
                "cards => cards.map(card => card.getBoundingClientRect().left)"
            )
            final_opacity = insight_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(side_positions[0] < first_settled_position
                  and side_positions[1] > final_positions[1]
                  and settled_opacity == [1, 0],
                  f"{width}px insight cards arrive from opposite sides and settle in order "
                  f"(start={side_positions}, settled={[first_settled_position, final_positions[1]]}, "
                  f"opacity={settled_opacity})")
            check(second_arrival[0]["opacity"] == 1
                  and 0 < second_arrival[1]["opacity"] < 1
                  and second_arrival[1]["left"] > final_positions[1],
                  f"{width}px the second card slides in after the first has settled")
            type_styles = insight_cards.first.evaluate(
                "card => ({headingSize:getComputedStyle(card.querySelector('h3')).fontSize, "
                "headingColor:getComputedStyle(card.querySelector('h3')).color, "
                "bodySize:getComputedStyle(card.querySelector('p')).fontSize, "
                "bodyColor:getComputedStyle(card.querySelector('p')).color})"
            )
            check(final_opacity == [1, 1],
                  f"{width}px both side-arriving cards settle before the scene changes")
            check(float(type_styles["headingSize"].replace("px", "")) >= 24
                  and float(type_styles["bodySize"].replace("px", "")) >= 12
                  and type_styles["headingColor"] == "rgb(48, 68, 58)"
                  and type_styles["bodyColor"] == "rgb(70, 84, 74)",
                  f"{width}px box typography has the larger, darker styling")
            pinned_state = page.locator(".hero-stage").evaluate(
                "element => getComputedStyle(element).position"
            )
            check(pinned_state == "sticky",
                  f"{width}px the hero section stays pinned during the card reveals")
            check(
                float(page.locator(".story-insights").evaluate(
                    "element => getComputedStyle(element).opacity"
                )) == 1,
                "Insights section stays fully visible through the longer reading hold",
            )
            check(revealed_count(page, DECISIONS) == 0,
                  "Decisions text stays faint before its own scroll phase")

            insight_opacity = page.locator(INSIGHTS).evaluate_all(
                "words => words.map(word => Number(word.style.opacity))"
            )
            check(min(insight_opacity) >= 0.88,
                  "Unread insights words remain visibly legible")
            set_story_progress(page, 0.75)
            check(revealed_count(page, INSIGHTS) == insight_count,
                  "Insights words finish revealing before their panel transitions")

            notes_cards = page.locator(".story-notes article")
            first_card_scroll = set_story_progress(page, 0.825)
            first_card = notes_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(first_card[0] > 0.4 and first_card[1:] == [0, 0, 0],
                  "The pinned notes scene reveals only its first card initially")
            second_card_scroll = set_story_progress(page, 0.865)
            second_card = notes_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(second_card[0] == 1 and second_card[1] > 0.4
                  and second_card[2:] == [0, 0],
                  "The second note card enters after the first during continued scroll")
            third_card_scroll = set_story_progress(page, 0.905)
            third_card = notes_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(third_card[:2] == [1, 1] and third_card[2] > 0.4
                  and third_card[3] == 0,
                  "The third note card follows while the final card waits")
            fourth_card_scroll = set_story_progress(page, 0.945)
            fourth_card = notes_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(fourth_card[:3] == [1, 1, 1] and fourth_card[3] > 0.4,
                  "The fourth note card enters only after the first three")
            check(second_card_scroll - first_card_scroll > 100
                  and third_card_scroll - second_card_scroll > 100
                  and fourth_card_scroll - third_card_scroll > 100,
                  "Each card entrance has a substantial scroll distance between steps")
            set_story_progress(page, 0.97)
            final_cards = notes_cards.evaluate_all(
                "cards => cards.map(card => Number(card.style.opacity))"
            )
            check(final_cards == [1, 1, 1, 1]
                  and float(page.locator(".story-notes").evaluate(
                      "element => getComputedStyle(element).opacity"
                  )) == 1,
                  "All four cards finish and hold together inside the pinned section")
            stage_bounds = page.locator(".hero-stage").evaluate(
                "element => { const rect = element.getBoundingClientRect(); "
                "return {top: rect.top, bottom: rect.bottom, "
                "position: getComputedStyle(element).position}; }"
            )
            last_card_bounds = notes_cards.nth(3).evaluate(
                "element => { const rect = element.getBoundingClientRect(); "
                "return {top: rect.top, bottom: rect.bottom}; }"
            )
            check(stage_bounds["position"] == "sticky"
                  and last_card_bounds["bottom"] <= stage_bounds["bottom"] + 1,
                  f"{width}px the pinned stage holds the full final card in view")

        if width == 1440:
            set_story_progress(page, 0.94)
            decisions_early = revealed_count(page, DECISIONS)
            set_story_progress(page, 0.99)
            decisions_late = revealed_count(page, DECISIONS)
            check(0 < decisions_early < decisions_late < decision_count,
                  "Decisions words brighten progressively in their own scroll phase")
            check(
                float(page.locator(".story-decisions").evaluate(
                    "element => getComputedStyle(element).opacity"
                )) > 0.7,
                "Decision cards remain visible while their final words reveal",
            )
            check(revealed_count(page, INSIGHTS) == insight_count,
                  "Insights text is fully readable after its scroll phase")

            page.goto(URL.replace("#/home", "#/weddings"), wait_until="load")
            page.wait_for_function("document.querySelector('#weddings').hidden === false")
            check(page.locator("#weddings .scroll-word").count() == 0,
                  "Wedding detail page has no word-by-word reveal")
        page.close()

    reduced = browser.new_page(
        viewport={"width": 1440, "height": 900},
        reduced_motion="reduce",
    )
    reduced.on("pageerror", lambda error: errors.append(str(error)))
    reduced.goto(URL, wait_until="load")
    reduced.wait_for_function("document.querySelector('.story-insights .scroll-word')")
    reduced.wait_for_timeout(100)
    check(
        reduced.locator(INSIGHTS).first.evaluate(
            "word => getComputedStyle(word).opacity"
        ) == "1",
        "Reduced motion keeps selected homepage words visible",
    )
    check(not errors, f"No browser errors: {errors}")
    reduced.close()
    browser.close()

print(f"PASS: {len(checks)} selected-section word-reveal checks")
