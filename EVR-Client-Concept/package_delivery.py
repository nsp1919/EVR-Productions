"""Check animated viewport bounds, PDF output and package the client files."""
from pathlib import Path
import zipfile
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

root = Path(__file__).resolve().parent
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for width in [390, 768, 1440]:
        page = browser.new_page(viewport={"width": width, "height": 900}, reduced_motion="no-preference")
        page.goto((root / "index.html").as_uri() + "#/home")
        page.wait_for_timeout(900)
        for position in [0, 250, 450, 700]:
            page.evaluate("(y) => scrollTo(0, y)", position)
            page.wait_for_timeout(80)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, position)
        page.close()
    browser.close()
for name, count in [("EVR-Concept-Presentation.pdf", 5), ("EVR-Sample-Quotation.pdf", 1)]:
    reader = PdfReader(root / name)
    assert len(reader.pages) == count
    assert all(len(page.extract_text()) > 50 for page in reader.pages)
archive = root.parent / "EVR-Client-Presentation-Package.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".html", ".css", ".js", ".svg", ".png", ".pdf", ".mp4", ".txt"} and "motion-recording" not in path.parts:
            output.write(path, Path(root.name) / path.relative_to(root))
with zipfile.ZipFile(archive) as output:
    assert output.testzip() is None
print("Animated overflow checks passed: 390, 768 and 1440 px at four scroll positions.")
print("PDF page counts and ZIP integrity passed.")
print(f"Package: {archive} ({archive.stat().st_size:,} bytes)")
