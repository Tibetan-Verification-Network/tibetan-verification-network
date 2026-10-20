"""Unit tests for archive file sniffing."""

from app.core.archive_files import detect_archive_mime_type, sanitize_original_filename

PNG = b"\x89PNG\r\n\x1a\n"


def test_sanitize_strips_paths() -> None:
    assert sanitize_original_filename("../../etc/passwd") == "passwd"
    assert sanitize_original_filename("folder/doc.pdf") == "doc.pdf"


def test_detect_png_and_reject_unknown() -> None:
    assert detect_archive_mime_type(PNG + b"rest") == "image/png"
    assert detect_archive_mime_type(b"\x00\x01\x02") is None


def test_plain_text_utf8() -> None:
    assert detect_archive_mime_type(b"Tibetan claim notes") == "text/plain"
