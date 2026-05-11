from pathlib import Path
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from enrich_media import apply_metadata, has_media_metadata, is_open_access_page, landing_url


def test_media_enrichment_checks_existing_full_text_once():
    paper = {"full_text_url": "https://example.org/article"}

    assert has_media_metadata(paper) is False

    assert apply_metadata(paper, {"media_checked_at": "2026-05-11T00:00:00Z"}) is True
    assert has_media_metadata(paper) is True


def test_landing_url_prefers_open_access_url():
    paper = {
        "open_access_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/",
        "full_text_url": "https://publisher.example/article",
    }

    assert landing_url(paper) == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"


def test_creative_commons_license_marks_page_open_access():
    soup = BeautifulSoup(
        '<html><head><link rel="license" href="https://creativecommons.org/licenses/by/4.0/"></head></html>',
        "html.parser",
    )

    assert is_open_access_page(soup, "https://example.org/article", "https://creativecommons.org/licenses/by/4.0/") is True
