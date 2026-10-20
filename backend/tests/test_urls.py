"""Safe URL parsing tests."""

import pytest

from app.core.urls import UnsafeUrlError, parse_submission_source_url


def test_parse_submission_source_url_normalizes_host_and_strips_fragment() -> None:
    parsed = parse_submission_source_url("https://example.com/path?q=1#fragment")
    assert parsed == "https://example.com/path?q=1"


def test_parse_submission_source_url_rejects_credentials() -> None:
    with pytest.raises(UnsafeUrlError):
        parse_submission_source_url("https://user:pass@example.com/")


def test_parse_submission_source_url_rejects_javascript_scheme() -> None:
    with pytest.raises(UnsafeUrlError):
        parse_submission_source_url("javascript:alert(1)")
