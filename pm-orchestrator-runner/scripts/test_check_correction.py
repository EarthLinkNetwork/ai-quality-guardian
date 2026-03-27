"""Unit tests for check_correction."""

import unittest

from check_correction import check_correction


class TestCheckCorrection(unittest.TestCase):
    """Tests for the check_correction function."""

    # --- True cases: valid corrections ---

    def test_typo_fix(self):
        self.assertTrue(check_correction("teh quick brown fox", "the quick brown fox"))

    def test_spelling_correction(self):
        self.assertTrue(check_correction("recieve the package", "receive the package"))

    def test_grammar_fix(self):
        self.assertTrue(check_correction("She go to school", "She goes to school"))

    def test_punctuation_fix(self):
        self.assertTrue(check_correction("Hello world", "Hello, world!"))

    def test_capitalization_fix(self):
        self.assertTrue(check_correction("python is great", "Python is great"))

    def test_whitespace_fix(self):
        self.assertTrue(check_correction("too  many   spaces", "too many spaces"))

    def test_word_addition(self):
        self.assertTrue(
            check_correction("I went the store", "I went to the store")
        )

    def test_word_removal(self):
        self.assertTrue(
            check_correction("I I went to the store", "I went to the store")
        )

    def test_longer_text_correction(self):
        original = (
            "The studnet submitted there assignment late becuase of a "
            "tecnical issue."
        )
        corrected = (
            "The student submitted their assignment late because of a "
            "technical issue."
        )
        self.assertTrue(check_correction(original, corrected))

    # --- False cases: not valid corrections ---

    def test_identical_texts(self):
        self.assertFalse(check_correction("hello world", "hello world"))

    def test_empty_original(self):
        self.assertFalse(check_correction("", "some text"))

    def test_whitespace_only_original(self):
        self.assertFalse(check_correction("   ", "some text"))

    def test_empty_corrected(self):
        self.assertFalse(check_correction("hello world", ""))

    def test_whitespace_only_corrected(self):
        self.assertFalse(check_correction("hello world", "   "))

    def test_completely_different_text(self):
        self.assertFalse(
            check_correction(
                "The weather is nice today",
                "XYZ 123 @@@ *** !!!",
            )
        )

    def test_both_empty(self):
        self.assertFalse(check_correction("", ""))

    def test_both_whitespace(self):
        self.assertFalse(check_correction("  ", "  "))

    # --- Edge cases ---

    def test_single_character_fix(self):
        self.assertTrue(check_correction("a", "b"))

    def test_case_only_change(self):
        self.assertTrue(check_correction("HELLO", "hello"))

    def test_multiline_correction(self):
        original = "Line one\nLine too\nLine three"
        corrected = "Line one\nLine two\nLine three"
        self.assertTrue(check_correction(original, corrected))


if __name__ == "__main__":
    unittest.main()
