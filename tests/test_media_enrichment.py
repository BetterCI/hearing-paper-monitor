from pathlib import Path
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from enrich_media import (
    apply_metadata,
    figure_metadata_from_pmc_xml,
    has_media_metadata,
    is_open_access_page,
    landing_url,
    needs_pubmed_full_text_image,
)


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


def test_pubmed_full_text_image_target_bypasses_prior_media_check():
    paper = {
        "pubmed_full_text_available": True,
        "pubmed_full_text_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/",
        "media_checked_at": "2026-05-11T00:00:00Z",
    }

    assert needs_pubmed_full_text_image(paper) is True
    assert has_media_metadata(paper) is False
    assert landing_url(paper) == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"


def test_pmc_xml_uses_figure_1_image_when_no_key_image_is_known():
    xml = """
    <article xmlns:xlink="http://www.w3.org/1999/xlink">
      <body>
        <fig id="F2">
          <label>Fig. 2.</label>
          <caption><p>Second figure.</p></caption>
          <graphic content-type="image" xlink:href="second.jpg" />
        </fig>
        <fig id="F1">
          <label>Fig. 1.</label>
          <caption><p>First figure caption.</p></caption>
          <graphic content-type="thumb" xlink:href="first-thumb.gif" />
          <graphic content-type="image" xlink:href="first.jpg" />
        </fig>
      </body>
    </article>
    """

    metadata = figure_metadata_from_pmc_xml(xml, "PMC1234567")

    assert metadata["key_image_url"] == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/bin/first.jpg"
    assert metadata["key_image_alt"] == "Fig. 1. First figure caption."


def test_creative_commons_license_marks_page_open_access():
    soup = BeautifulSoup(
        '<html><head><link rel="license" href="https://creativecommons.org/licenses/by/4.0/"></head></html>',
        "html.parser",
    )

    assert is_open_access_page(soup, "https://example.org/article", "https://creativecommons.org/licenses/by/4.0/") is True
