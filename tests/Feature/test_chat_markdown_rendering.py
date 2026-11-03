import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CHAT_VIEW = ROOT / "resources" / "views" / "chat.blade.php"


class ChatMarkdownRenderingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CHAT_VIEW.read_text(encoding="utf-8")

    def test_markdown_and_sanitizer_cdn_versions_are_pinned(self):
        scripts = re.findall(r'<script\s+src="([^"]+)"', self.source)

        self.assertIn(
            "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
            scripts,
        )
        self.assertIn(
            "https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js",
            scripts,
        )
        self.assertNotIn("https://cdn.jsdelivr.net/npm/marked/marked.min.js", scripts)
        self.assertNotIn("https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js", scripts)

    def test_markdown_is_parsed_then_sanitized_before_insertion(self):
        self.assertIn("function renderMarkdown(text)", self.source)
        self.assertIn("return DOMPurify.sanitize(marked.parse(text));", self.source)
        self.assertRegex(
            self.source,
            r"bubble\.innerHTML\s*=\s*renderMarkdown\(content\s*\|\|\s*''\)",
        )


if __name__ == "__main__":
    unittest.main()
