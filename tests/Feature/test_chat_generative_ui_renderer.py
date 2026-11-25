import re
import unittest
from pathlib import Path

CHAT_VIEW = Path("/home/hamid/sima-dev/resources/views/chat.blade.php")


class ChatGenerativeUiRendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CHAT_VIEW.read_text(encoding="utf-8")

    def test_generative_ui_flag_const_is_present(self):
        self.assertIn("const CHAT_GENERATIVE_UI_ENABLED", self.source)
        self.assertRegex(
            self.source,
            r"config\('chat\.generative_ui\.enabled'",
        )

    def test_render_dynamic_ui_handler_is_present(self):
        self.assertIn("data.tool === 'render_dynamic_ui'", self.source)
        self.assertIn("renderDynamicUiWidget(data.result)", self.source)

    def test_render_dynamic_ui_widget_function_exists(self):
        self.assertIn("function renderDynamicUiWidget(payload)", self.source)
        self.assertIn("component", self.source)
        self.assertIn("title", self.source)

    def test_dynamic_ui_gated_behind_generative_ui_flag(self):
        self.assertRegex(
            self.source,
            r"render_dynamic_ui' && CHAT_GENERATIVE_UI_ENABLED",
        )

    def test_final_answer_links_are_rendered(self):
        self.assertIn("data.links && data.links.length", self.source)
        self.assertIn("renderLinksBlock(data.links)", self.source)

    def test_render_links_block_function_exists(self):
        self.assertIn("function renderLinksBlock(links)", self.source)
        self.assertIn("CHAT_GENERATIVE_UI_ENABLED", self.source)

    def test_internal_links_use_pushstate_navigation(self):
        self.assertIn("data-internal-link", self.source)
        self.assertIn("pushState", self.source)


if __name__ == "__main__":
    unittest.main()
