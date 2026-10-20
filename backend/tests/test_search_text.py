"""Unit tests for bilingual search normalization."""

from app.core.search_text import build_search_fields, tibetan_syllable_tokens


def test_tibetan_syllable_tokens_split_on_tsheg() -> None:
    text = "བོད་ཡིག་ཚོད་ལྟ"
    tokens = tibetan_syllable_tokens(text)
    assert len(tokens) >= 3


def test_build_search_fields_includes_latin_and_tibetan() -> None:
    search_text, search_tokens = build_search_fields(
        title="Health claim",
        summary="བོད་ཡིག",
        claim_text="COVID vaccine",
        context_text="Context",
        analysis_markdown="Analysis",
        verdict_explanation="Explanation",
    )
    assert "health" in search_text
    assert "covid" in search_text
    assert any("བོད" in token for token in search_tokens)
