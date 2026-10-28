"""Export a self-contained client layout deck and validate its printable pages."""
import base64
import mimetypes
from pathlib import Path
import re

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "layout-plan.html"
HTML = ROOT / "EVR-Layout-and-Plan.html"
PDF = ROOT / "EVR-Layout-and-Plan.pdf"
source = SOURCE.read_text(encoding="utf-8")


def embed(match):
    path = ROOT / Path(match.group(1))
    if not path.is_file():
        raise FileNotFoundError(path)
    mime = mimetypes.guess_type(path.name)[0]
    if not mime or not mime.startswith("image/"):
        raise ValueError(f"Unsupported image: {path}")
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f'src="data:{mime};base64,{data}"'


HTML.write_text(re.sub(r'src="(assets/[^"]+)"', embed, source), encoding="utf-8")
checks = 0
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri())
    page.wait_for_function("Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)")
    assert page.locator(".slide").count() == 9
    checks += 1
    assert page.locator('img:not([src^="data:"])').count() == 0
    checks += 1
    page.emulate_media(media="print")
    for index, slide in enumerate(page.locator(".slide").all(), start=1):
        layout = slide.evaluate("""el=>{
          const box=el.getBoundingClientRect();
          const footer=el.querySelector('.footer').getBoundingClientRect();
          const children=[...el.children].filter(child=>!child.classList.contains('footer'));
          return {overflow:el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight,
            below:children.filter(child=>child.getBoundingClientRect().bottom>footer.top-8).map(child=>child.className),
            outside:children.filter(child=>{const r=child.getBoundingClientRect();return r.left<box.left||r.right>box.right}).map(child=>child.className)};
        }""")
        assert not layout["overflow"] and not layout["below"] and not layout["outside"], (index, layout)
        checks += 1
    page.pdf(path=str(PDF), print_background=True, prefer_css_page_size=True)
    page.emulate_media(media="screen")
    page.evaluate("scrollTo(0,0)")
    for index in range(2, 10):
        page.locator("#next").click()
        page.wait_for_function("n=>document.querySelector('#position').value===n+' / 9'", arg=index)
        checks += 1
    assert page.locator("#next").is_disabled()
    page.keyboard.press("ArrowLeft")
    page.wait_for_function("document.querySelector('#position').value==='8 / 9'")
    checks += 2
    page.keyboard.press("ArrowRight")
    page.wait_for_function("document.querySelector('#position').value==='9 / 9'")
    checks += 1
    for width in [390, 768, 1440]:
        page.set_viewport_size({"width": width, "height": 900})
        page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), width
        checks += 1
    page.set_viewport_size({"width": 1500, "height": 1000})
    page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    page.evaluate("scrollTo(0,0)")
    page.locator(".toolbar").evaluate("el=>el.style.visibility='hidden'")
    for number in [1, 2, 7, 9]:
        page.locator(".slide").nth(number - 1).screenshot(
            path=str(ROOT / "assets" / f"layout-plan-slide-{number}.png")
        )
    assert not errors, errors
    checks += 1
    browser.close()

reader = PdfReader(PDF)
assert len(reader.pages) == 9
checks += 1
for number, sheet in enumerate(reader.pages, start=1):
    text = sheet.extract_text()
    assert len(text) > 250, number
    assert f"{number:02d} / 09" in text, number
    assert abs(float(sheet.mediabox.width) - 1080) < 0.5 and abs(float(sheet.mediabox.height) - 675) < 0.5
    assert not re.search(r"\bINR\b|[₹$]\s*\d|65,000|95,000", text)
    checks += 4
assert "Pricing will be discussed on a call." in reader.pages[6].extract_text()
checks += 1
print(f"Layout presentation verified: {checks} checks; 9 PDF pages; embedded browser images.")
print(f"PDF: {PDF}")
print(f"Standalone HTML: {HTML}")
