"""Module for verifying whether a text has been corrected."""

import difflib


def check_correction(original_text: str, corrected_text: str) -> bool:
    """Verify whether corrected_text is an accurate correction of original_text.

    A correction is considered accurate when:
    - The corrected text differs from the original (a change was actually made).
    - The corrected text is not empty (unless the original was also empty).
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

    # For very short texts (5 chars or fewer), any non-empty change counts
    # as a valid correction since similarity metrics are unreliable.
    if len(original_text.strip()) <= 5:
        return True

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
