"""Draw original pen-style wireframes and export a four-sheet client PDF."""
import base64
import html
import math
from pathlib import Path
import random

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
FONT = Path(r"C:\Windows\Fonts\Inkfree.ttf")
FONT_DATA = base64.b64encode(FONT.read_bytes()).decode("ascii")
OUT = ROOT / "assets"
RNG = random.Random(27)


class Sketch:
    def __init__(self, title, number):
        self.parts = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">',
            '<rect width="1200" height="1600" fill="#faf8f1"/>',
        ]
        for _ in range(1100):
            self.parts.append(
                f'<circle cx="{RNG.uniform(0,1200):.1f}" cy="{RNG.uniform(0,1600):.1f}" '
                f'r="{RNG.uniform(.2,.65):.2f}" fill="#85735c" opacity="{RNG.uniform(.035,.10):.2f}"/>'
            )
        self.text(66, 69, "EVR / WEBSITE SKETCH", 23)
        self.text(66, 127, title, 38)
        self.line(65, 148, 1135, 148)
        self.text(68, 1568, "Layout only  /  boxes = your photos & films", 19, "#777168")
        self.text(1065, 1568, f"{number} / 4", 20)

    def line(self, x1, y1, x2, y2, faint=False):
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if not length:
            raise ValueError("A sketch stroke needs distinct endpoints")
        nx, ny = -dy / length, dx / length
        count = max(1, math.ceil(length / 105))
        for repeat in range(1 if faint else 2):
            amplitude = min(2.6, length / 12)
            offset = RNG.uniform(-1.3, 1.3)
            start = (x1 + nx * offset - dx / length * RNG.uniform(0, 3),
                     y1 + ny * offset - dy / length * RNG.uniform(0, 3))
            points = [start]
            for step in range(1, count + 1):
                progress = step / count
                deviation = RNG.uniform(-amplitude, amplitude)
                points.append((x1 + dx * progress + nx * deviation,
                               y1 + dy * progress + ny * deviation))
            path = f"M {points[0][0]:.1f} {points[0][1]:.1f}"
            for a, b in zip(points, points[1:]):
                bow = RNG.uniform(-amplitude, amplitude)
                path += (f" Q {(a[0]+b[0])/2+nx*bow:.1f} {(a[1]+b[1])/2+ny*bow:.1f}"
                         f" {b[0]:.1f} {b[1]:.1f}")
            self.parts.append(
                f'<path d="{path}" fill="none" stroke="#49433c" '
                f'stroke-width="{RNG.uniform(1.05,1.85) if repeat == 0 else RNG.uniform(.45,.85):.2f}" '
                f'opacity="{.20 if faint else (.79 if repeat == 0 else .24)}" '
                'stroke-linecap="round" stroke-linejoin="round"/>'
            )

    def box(self, x, y, width, height, fill=None):
        if fill:
            self.parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="{fill}"/>')
        self.line(x, y, x + width, y)
        self.line(x + width, y, x + width, y + height)
        self.line(x + width, y + height, x, y + height)
        self.line(x, y + height, x, y)

    def text(self, x, y, text, size=22, colour="#454039", anchor="start"):
        if not text:
            return
        previous = 0
        letters = []
        for char in text:
            shift = RNG.uniform(-.55, .55)
            letters.append(
                f'<tspan dy="{shift-previous:.2f}" rotate="{RNG.uniform(-2.5,2.5):.1f}">'
                f'{html.escape(char)}</tspan>'
            )
            previous = shift
        tilt = RNG.uniform(-1.1, 1.1) if x >= 950 else RNG.uniform(-.35, .35)
        self.parts.append(
            f'<text x="{x}" y="{y}" font-family="SketchHand" font-size="{size*1.06:.2f}" '
            f'fill="{colour}" text-anchor="{anchor}" '
            f'xml:space="preserve" transform="rotate({tilt:.2f} {x} {y})">{"".join(letters)}</text>'
        )

    def lines(self, x, y, values, size=22, gap=32):
        for i, value in enumerate(values):
            self.text(x, y + i * gap, value, size)

    def media(self, x, y, width, height, label="photo / film", play=False):
        self.box(x, y, width, height)
        self.line(x + 7, y + 7, x + width - 7, y + height - 7, True)
        self.line(x + width - 7, y + 7, x + 7, y + height - 7, True)
        if play:
            cx, cy = x + width / 2, y + height / 2 - 9
            self.parts.append(
                f'<path d="M {cx-9} {cy-15} L {cx+17} {cy} L {cx-9} {cy+15} Z" '
                'fill="#faf8f1" stroke="#454039" stroke-width="1.5"/>'
            )
        self.text(x + width / 2, y + height - 14, label, 18, anchor="middle")

    def button(self, x, y, width, label):
        self.box(x, y, width, 43)
        for offset in range(5, int(width)-4, 8):
            self.line(x+offset, y+39, x+offset+5, y+34, True)
        self.text(x + width / 2, y + 28, label, 18, anchor="middle")

    def arrow(self, x1, y1, x2, y2):
        dx, dy = x2-x1, y2-y1
        bend = min(18, math.hypot(dx, dy)*.15)
        cx, cy = (x1+x2)/2 - dy*.1, (y1+y2)/2 + bend
        self.parts.append(
            f'<path d="M {x1} {y1} Q {cx:.1f} {cy:.1f} {x2} {y2}" '
            'fill="none" stroke="#635d55" stroke-width="1.5" stroke-linecap="round"/>'
        )
        angle = math.atan2(y2-cy, x2-cx)
        for offset in [-.5, .5]:
            self.line(x2, y2, x2-13*math.cos(angle+offset), y2-13*math.sin(angle+offset))

    def frame(self, x, y, width, height, title):
        for offset in range(12, int(width)-12, 16):
            self.line(x+offset, y+height+6, x+offset+7, y+height+1, True)
        self.box(x, y, width, height)
        self.line(x, y + 34, x + width, y + 34)
        for cx in [x+15, x+28, x+41]:
            self.parts.append(
                f'<path d="M {cx+3} {y+16} c 0 -4 -7 -4 -6 0 c -1 4 7 4 6 -1" '
                'fill="none" stroke="#676157" stroke-width="1"/>'
            )
        self.text(x + 60, y + 23, title, 15)

    def finish(self):
        return "".join(self.parts) + "</svg>"


def header(s, corporate=False):
    s.frame(62, 180, 875, 1318, "evr / brands & corporate" if corporate else "evr / home")
    s.text(84, 250, "EVR", 31)
    s.button(310, 221, 230, "Home  |  Brands")
    s.text(570, 249, "Services  Approach  Work" if corporate else "Weddings  Work  Process", 17)
    s.button(805, 221, 112, "Quote")
    s.line(63, 280, 936, 280)


def homepage(corporate=False):
    s = Sketch("02. Brands & Corporate" if corporate else "01. Home / Weddings", 2 if corporate else 1)
    header(s, corporate)
    s.lines(90, 333, ["Your brand.", "Made to move", "people."] if corporate else ["Life gives you", "the story.", "We frame it."], 34, 43)
    s.lines(90, 485, ["A short introduction", "to EVR + what we create"], 20, 28)
    s.button(90, 548, 215, "Let's talk" if corporate else "Plan your wedding")
    if corporate:
        s.media(545, 309, 350, 272, "brand showreel", True)
    else:
        s.parts.append('<g transform="rotate(-7 664 422)">')
        s.media(513, 333, 198, 218, "brand")
        s.parts.append('</g><g transform="rotate(8 772 426)">')
        s.media(704, 324, 183, 225, "creator")
        s.parts.append('</g>')
        s.box(610, 309, 202, 262, "#faf8f1")
        s.media(610, 309, 202, 262, "wedding film", True)
    s.line(83, 620, 916, 620)
    s.text(87, 661, "What we make" if corporate else "Choose your story", 25)
    if corporate:
        s.lines(95, 714, ["Brand films", "Reels", "YouTube", "Podcasts"], 20, 29)
        s.media(320, 685, 285, 155, "changing service art")
        s.lines(636, 724, ["Service intro", "+ scope", "+ next step"], 22, 36)
    else:
        for x, label in [(88, "Wedding stories"), (510, "Brand stories")]:
            s.media(x, 684, 396, 144, label)
    s.line(83, 865, 916, 865)
    s.text(88, 907, "Reels + selected brand work" if corporate else "Selected work + film preview", 25)
    for i in range(3):
        s.media(88 + i*281, 930, 264, 126, f"project {i+1}", i == 1)
    s.line(83, 1080, 916, 1080)
    s.text(88, 1121, "Our approach / production journey" if corporate else "Your project, step by step", 25)
    s.box(88, 1143, 824, 78)
    s.text(109, 1177, "Brief  >  Plan  >  Shoot  >  Edit  >  Deliver", 22)
    s.text(109, 1206, "stage changes as you scroll", 17)
    s.line(83, 1248, 916, 1248)
    s.text(90, 1284, "Team / genuine reviews / FAQ", 24)
    s.line(90, 1306, 496, 1306, True)
    s.line(90, 1327, 713, 1327, True)
    s.text(90, 1380, "Let's make your next story.", 26)
    s.button(90, 1400, 241, "Request a quote")
    s.text(90, 1474, "Contact  /  social links  /  footer", 18)
    s.button(722, 1418, 196, "Brand quote +" if corporate else "Wedding quote +")
    s.lines(958, 236, ["one-click", "switch"], 19, 27)
    s.arrow(958, 274, 535, 268)
    s.lines(958, 398, ["film area" if corporate else "3 stacked cards", "click to play" if corporate else "tap rear card", "" if corporate else "to bring front"], 18, 27)
    s.arrow(963, 467, 905, 455)
    s.lines(958, 698, ["scroll scene" if corporate else "scroll unfolds", "art + copy" if corporate else "the story"], 19, 29)
    s.arrow(960, 764, 909, 764)
    s.lines(958, 1139, ["scroll through", "the stages"], 19, 28)
    s.arrow(960, 1205, 921, 1205)
    s.lines(958, 1370, ["floating", "quote button"], 19, 29)
    s.arrow(975, 1433, 924, 1433)
    return s.finish()


def detail_pages():
    s = Sketch("03. Service & process pages", 3)
    for x, y, title, detail, chapters in [
        (65, 190, "WEDDINGS", "Your day. Your story.", ["Before the day", "The celebration", "The keepsakes"]),
        (620, 190, "SERVICES", "Choose your format.", ["Brand films / Reels", "YouTube / Podcasts"]),
        (65, 850, "OUR PROCESS", "A clear wedding plan.", ["Enquiry > Planning", "Shoot > Edit > Deliver"]),
        (620, 850, "OUR APPROACH", "From brief to screen.", ["Brief > Plan", "Produce > Handover"]),
    ]:
        s.text(x, y, title, 26)
        top = y + 24
        s.frame(x, top, 515, 579, title.lower())
        s.text(x+18, top+70, "EVR       Home | Brands       Menu", 19)
        s.line(x+12, top+90, x+503, top+90)
        s.lines(x+18, top+132, [detail, "Short introduction"], 22, 34)
        s.media(x+309, top+107, 181, 103, "hero media")
        s.text(x+18, top+258, "Scroll-driven chapters", 24)
        s.box(x+18, top+280, 475, 150)
        s.media(x+30, top+293, 169, 120, "chapter art")
        s.lines(x+218, top+323, chapters, 18, 30)
        s.arrow(x+460, top+308, x+460, top+398)
        s.text(x+20, top+465, "Details / principles / FAQ", 20)
        s.line(x+20, top+483, x+475, top+483, True)
        s.button(x+20, top+505, 213, "Discuss your project")
        s.text(x+307, top+554, "footer / contact", 16)
    return s.finish()


def work_quote():
    s = Sketch("04. Work & quote-request pages", 4)
    for x, title, categories in [
        (65, "WEDDING WORK", "Wedding / Pre-wedding / Events"),
        (620, "BRAND WORK", "Brand films / Reels / Conversations"),
    ]:
        s.text(x, 192, title, 26)
        s.frame(x, 217, 515, 482, title.lower())
        s.text(x+18, 285, "EVR       Home | Brands       Menu", 19)
        s.media(x+18, 305, 477, 147, "featured project", True)
        s.text(x+18, 488, categories, 18)
        for i in range(3):
            s.media(x+18+i*162, 506, 151, 104, "story")
        s.text(x+18, 649, "Tap a project > brief + film + photos", 18)
        s.text(x+18, 678, "Enquiry / contact", 17)
    for x, title, rows in [
        (65, "WEDDING QUOTE", ["Events / dates / shoot days", "Crew / films / albums"]),
        (620, "PRODUCTION QUOTE", ["Production type / shoot days", "Crew / edits / output formats"]),
    ]:
        s.text(x, 776, title, 26)
        s.frame(x, 801, 515, 590, title.lower())
        s.text(x+18, 869, "Tell us what you need.", 26)
        for offset, label in enumerate(["Name / contact / location"] + rows):
            y = 892 + offset*69
            s.box(x+18, y, 477, 53)
            s.text(x+32, y+34, label, 18)
        s.box(x+18, 1111, 477, 79)
        s.lines(x+32, 1142, ["Your requirements summary", "No prices or automatic total"], 20, 30)
        s.lines(x+20, 1232, ["Pricing will be discussed", "on a call."], 24, 33)
        s.button(x+20, 1302, 272, "Discuss my requirements")
        s.text(x+20, 1370, "Preview / save requirement PDF", 17)
    s.text(75, 1460, "Choose requirements", 22)
    s.arrow(370, 1450, 468, 1450)
    s.text(485, 1460, "Enquiry", 22)
    s.arrow(651, 1450, 751, 1450)
    s.text(776, 1460, "A call with EVR", 22)
    return s.finish()


drawings = [homepage(), homepage(True), detail_pages(), work_quote()]
sections = "".join(f'<section class="sheet" aria-label="Layout sheet {i}">{svg}</section>' for i, svg in enumerate(drawings, 1))
document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EVR - Hand-drawn Website Layout</title>
<style>
@font-face {{ font-family:SketchHand; src:url(data:font/ttf;base64,{FONT_DATA}) format('truetype'); }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:#e4e1d9; }}
.sheet {{ width:min(100%,1200px); margin:24px auto; box-shadow:0 5px 24px #0002; }}
svg {{ display:block; width:100%; height:auto; }}
.tools {{ text-align:center; padding:16px; font:16px Arial; }}
button {{ padding:12px 24px; border:1px solid #777; border-radius:8px; background:#faf8f1; cursor:pointer; }}
@media print {{ @page {{ size:1200px 1600px; margin:0; }}
body {{ background:white; }} .tools {{ display:none; }}
.sheet {{ width:1200px; height:1600px; margin:0; box-shadow:none; break-after:page; }}
.sheet:last-child {{ break-after:auto; }} svg {{ print-color-adjust:exact; -webkit-print-color-adjust:exact; }}
}}
</style></head><body>
<div class="tools"><button onclick="print()">Print / Save as PDF</button></div>
{sections}</body></html>"""
html_path = ROOT / "EVR-Hand-Drawn-Layout.html"
pdf_path = ROOT / "EVR-Hand-Drawn-Layout.pdf"
html_path.write_text(document, encoding="utf-8")
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1240, "height": 1700}, device_scale_factor=1)
    page.goto(html_path.as_uri())
    page.evaluate("document.fonts.ready")
    assert page.evaluate("document.fonts.check('22px SketchHand')")
    for i, sheet in enumerate(page.locator(".sheet").all(), 1):
        # Check drawn text, not only the outer page bounds.
        invalid = sheet.locator("svg").evaluate("""svg=>[...svg.querySelectorAll('text')].filter(t=>{
          const r=t.getBBox(); return r.x<0 || r.y<0 || r.x+r.width>1190 || r.y+r.height>1590;
        }).map(t=>t.textContent)""")
        assert not invalid, (i, invalid)
        sheet.screenshot(path=str(OUT / f"EVR-Sketch-{i:02}.png"))
    page.pdf(path=str(pdf_path), print_background=True, prefer_css_page_size=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    browser.close()
reader = PdfReader(pdf_path)
assert len(reader.pages) == 4
for sheet in reader.pages:
    assert len(sheet.extract_text()) > 250
assert "Pricing will be discussed" in reader.pages[-1].extract_text()
print(f"Verified 4 sketch sheets, embedded handwriting font, text bounds and mobile fit.\n{pdf_path}\n{html_path}")
