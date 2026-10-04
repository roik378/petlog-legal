from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BASE = "d23209f0a5add2e2ad5908ee9e99e8f0af186e3c"


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []
        self.images = []
        self.stylesheets = []
        self.text = []
        self.body = False
        self.skip = []
        self.main_count = 0
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "body":
            self.body = True
        if tag == "main":
            self.main_count += 1
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.stylesheets.append(attrs.get("href"))
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if tag == "img":
            self.images.append(attrs)
        if tag in ("style", "script") or attrs.get("data-site-chrome"):
            self.skip.append(tag)

    def handle_endtag(self, tag):
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()
        if tag == "body":
            self.body = False

    def handle_data(self, text):
        if self.body and not self.skip:
            self.text.extend(text.split())


class SiteTests(unittest.TestCase):
    def test_all_local_destinations_exist(self):
        for path in ROOT.glob("*.html"):
            page = Page(path.read_text())
            for destination in page.links + page.stylesheets + [image["src"] for image in page.images]:
                target = urlsplit(destination)
                if target.scheme or target.netloc:
                    continue
                with self.subTest(page=path.name, link=destination):
                    local = ROOT / unquote(target.path) if target.path else path
                    self.assertTrue(local.is_file(), str(local))
                    if target.fragment:
                        self.assertIn(unquote(target.fragment), Page(local.read_text()).ids)

    def test_documents_preserve_original_wording_and_links(self):
        originals = subprocess.check_output(
            ["git", "ls-tree", "--name-only", BASE], cwd=ROOT, text=True
        ).splitlines()
        for name in originals:
            if not name.endswith(".html"):
                continue
            with self.subTest(document=name):
                before = Page(subprocess.check_output(["git", "show", f"{BASE}:{name}"], cwd=ROOT, text=True))
                after = Page((ROOT / name).read_text())
                self.assertEqual(before.text, after.text)
                self.assertEqual(after.links[3:], before.links)

    def test_accessible_document_structure(self):
        for path in ROOT.glob("*.html"):
            with self.subTest(page=path.name):
                page = Page(path.read_text())
                self.assertEqual(page.main_count, 1)
                self.assertEqual(page.ids.count("main-content"), 1)
                self.assertEqual(len(page.ids), len(set(page.ids)))
                self.assertEqual(page.stylesheets, ["support.css"])
                self.assertIn("#main-content", page.links)
                self.assertIn("index.html", page.links)

    def test_directory_covers_existing_document_library(self):
        page = Page((ROOT / "index.html").read_text())
        files = {urlsplit(link).path for link in page.links}
        documents = {path.name for path in ROOT.glob("*.html") if path.name != "index.html"}
        self.assertTrue(documents <= files, documents - files)
        self.assertEqual(len(page.images), 6)
        for image in page.images:
            self.assertEqual(image.get("width"), "48")
            self.assertEqual(image.get("height"), "48")
            self.assertIn("alt", image)

    def test_no_remote_font_or_tracking_dependency(self):
        for path in ROOT.glob("*.html"):
            html = path.read_text().lower()
            self.assertNotIn("<script", html)
        css = (ROOT / "support.css").read_text()
        self.assertNotIn("@import", css)
        self.assertNotIn("url(", css)
        self.assertNotIn("vw", css)
        self.assertIn("letter-spacing: 0", css)

    def test_reading_sizes_follow_the_root_font(self):
        css = (ROOT / "support.css").read_text()
        sizes = re.findall(r"font-size:\s*([^;]+);", css)
        self.assertIn("100%", sizes)
        self.assertTrue(all(size == "100%" or size.endswith("rem") for size in sizes), sizes)
        self.assertIn(".documents a { line-height: 1.45; font-size: 1rem;", css)
        self.assertIn(".documents { grid-template-columns: minmax(0, 1fr); }", css)


if __name__ == "__main__":
    unittest.main()
