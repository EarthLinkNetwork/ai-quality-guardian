"""Module for verifying whether a text has been corrected."""

import difflib


def check_correction(original_text: str, corrected_text: str) -> bool:
    """Verify whether corrected_text is an accurate correction of original_text.

    A correction is considered accurate when:
    - The corrected text differs from the original (a change was actually made).
    - The original text must be non-empty.
    - The corrected text must be non-empty.
    - The corrected text preserves the general meaning by maintaining a high
      similarity ratio (>= 0.3) with the original — i.e. it is a correction,
      not a completely unrelated replacement.

    Args:
        original_text: The original text before correction.
        corrected_text: The text after correction.

    Returns:
        True if corrected_text is an accurate correction of original_text,
        False otherwise.
    """
    # If both are identical, no correction was made.
    if original_text == corrected_text:
        return False

    # If the original is empty, there is nothing to correct.
    if not original_text.strip():
        return False

    # If the corrected text is empty, it's a deletion, not a correction.
    if not corrected_text.strip():
        return False

    original_clean = original_text.strip()
    corrected_clean = corrected_text.strip()

    # For single-character texts, any non-empty change counts as valid.
    if len(original_clean) == 1:
        return True

    # For very short texts (2-5 chars), apply a relaxed similarity threshold
    # since standard metrics are less reliable at this length.
    if len(original_clean) <= 5:
        short_similarity = difflib.SequenceMatcher(
            None, original_clean.lower(), corrected_clean.lower()
        ).ratio()
        return short_similarity >= 0.3

    # The corrected text must be similar enough to the original to count
    # as a correction rather than a complete replacement.  We compare
    # case-insensitively so that pure case changes still register as
    # corrections rather than unrelated replacements.
    similarity = difflib.SequenceMatcher(
        None, original_text.lower(), corrected_text.lower()
    ).ratio()
    if similarity < 0.3:
        return False

    return True
