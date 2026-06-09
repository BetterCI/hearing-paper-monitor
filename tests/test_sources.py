import xml.etree.ElementTree as ET
import datetime as dt

import feedparser

from scripts.paper_monitor.config import Journal
from scripts.paper_monitor.sources import (
    _crossref_open_access_metadata,
    _crossref_publication_stage,
    _limit_arxiv_preprints,
    _paper_from_arxiv_entry,
    _paper_from_crossref,
    _paper_from_pubmed,
)
from scripts.paper_monitor.models import Paper


def test_crossref_online_first_without_issue_assignment_is_early_access():
    item = {
        "title": ["A hearing science paper"],
        "published-online": {"date-parts": [[2026, 5, 1]]},
    }

    assert _crossref_publication_stage(item, "Ear and Hearing", "2026-05-01") == "early_access"


def test_online_only_journal_is_not_early_access_by_default():
    item = {
        "title": ["A trends in hearing paper"],
        "published-online": {"date-parts": [[2026, 5, 1]]},
    }

    assert _crossref_publication_stage(item, "Trends in Hearing", "2026-05-01") is None


def test_future_publication_date_is_early_access():
    item = {"title": ["An article in press"]}

    assert _crossref_publication_stage(item, "Hearing Research", "2999-01-01") == "early_access"


def test_crossref_month_only_date_keeps_month_precision():
    item = {
        "title": ["A Hearing Research issue paper"],
        "DOI": "10.1234/month-only",
        "URL": "https://doi.org/10.1234/month-only",
        "published-print": {"date-parts": [[2026, 5]]},
    }
    journal = Journal(key="hearing-research", name="Hearing Research", aliases=[], issn=[])

    paper = _paper_from_crossref(item, journal)

    assert paper.publication_date == "2026-05-01"
    assert paper.publication_date_precision == "month"


def test_pubmed_article_date_is_kept_as_online_date():
    article = ET.fromstring(
        """
        <PubmedArticle>
          <MedlineCitation>
            <PMID>123456</PMID>
            <Article>
              <Journal>
                <JournalIssue>
                  <PubDate><Year>2026</Year><Month>May</Month></PubDate>
                </JournalIssue>
              </Journal>
              <ArticleTitle>Online date for a monthly issue paper</ArticleTitle>
              <ArticleDate DateType="Electronic"><Year>2026</Year><Month>03</Month><Day>18</Day></ArticleDate>
            </Article>
          </MedlineCitation>
        </PubmedArticle>
        """
    )
    journal = Journal(key="hearing-research", name="Hearing Research", aliases=[], issn=[])

    paper = _paper_from_pubmed(article, journal)

    assert paper.publication_date == "2026-05-01"
    assert paper.publication_date_precision == "month"
    assert paper.available_online_date == "2026-03-18"


def test_crossref_open_license_marks_open_access():
    metadata = _crossref_open_access_metadata(
        {
            "URL": "https://doi.org/10.1234/open",
            "license": [{"URL": "https://creativecommons.org/licenses/by/4.0/"}],
            "link": [{"URL": "https://example.org/full-text"}],
        },
        "10.1234/open",
    )

    assert metadata["open_access"] is True
    assert metadata["open_access_url"] == "https://example.org/full-text"
    assert metadata["open_access_source"] == "crossref_license"
    assert metadata["license_url"] == "https://creativecommons.org/licenses/by/4.0/"


def test_crossref_closed_license_is_not_marked_open_access():
    metadata = _crossref_open_access_metadata(
        {"license": [{"URL": "https://publisher.example/license"}]},
        "10.1234/closed",
    )

    assert metadata["open_access"] is None
    assert metadata["open_access_url"] is None
    assert metadata["license_url"] is None


def test_pubmed_pmc_id_marks_open_access():
    article = ET.fromstring(
        """
        <PubmedArticle>
          <MedlineCitation>
            <PMID>123456</PMID>
            <Article>
              <Journal>
                <JournalIssue>
                  <PubDate><Year>2026</Year><Month>5</Month><Day>1</Day></PubDate>
                </JournalIssue>
              </Journal>
              <ArticleTitle>Speech perception in hearing loss</ArticleTitle>
              <Abstract><AbstractText>Example abstract.</AbstractText></Abstract>
              <AuthorList>
                <Author><ForeName>A.</ForeName><LastName>Author</LastName></Author>
              </AuthorList>
            </Article>
          </MedlineCitation>
          <PubmedData>
            <ArticleIdList>
              <ArticleId IdType="doi">10.1234/pmc-open</ArticleId>
              <ArticleId IdType="pmc">PMC1234567</ArticleId>
            </ArticleIdList>
          </PubmedData>
        </PubmedArticle>
        """
    )
    journal = Journal(key="ear-hearing", name="Ear and Hearing", aliases=[], issn=[])

    paper = _paper_from_pubmed(article, journal)

    assert paper.open_access is True
    assert paper.open_access_url == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"
    assert paper.open_access_source == "pubmed_pmc"
    assert paper.pubmed_full_text_available is True
    assert paper.pubmed_full_text_url == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"
    assert paper.pubmed_full_text_source == "pmc"


def test_numeric_pubmed_pmc_id_is_normalized_for_full_text_url():
    article = ET.fromstring(
        """
        <PubmedArticle>
          <MedlineCitation>
            <PMID>123456</PMID>
            <Article>
              <Journal>
                <JournalIssue>
                  <PubDate><Year>2026</Year><Month>5</Month><Day>1</Day></PubDate>
                </JournalIssue>
              </Journal>
              <ArticleTitle>Auditory full text article</ArticleTitle>
            </Article>
          </MedlineCitation>
          <PubmedData>
            <ArticleIdList>
              <ArticleId IdType="pmc">1234567</ArticleId>
            </ArticleIdList>
          </PubmedData>
        </PubmedArticle>
        """
    )
    journal = Journal(key="jaro", name="Journal of the Association for Research in Otolaryngology", aliases=[], issn=[])

    paper = _paper_from_pubmed(article, journal)

    assert paper.pubmed_full_text_url == "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"


def test_arxiv_entry_matching_requested_topic_becomes_review_preprint():
    feed = feedparser.parse(
        """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2606.01234v1</id>
            <published>2026-06-06T00:00:00Z</published>
            <title>Speech perception with cochlear implants in noisy rooms</title>
            <summary>We study speech perception outcomes for cochlear implant listeners.</summary>
            <author><name>A. Author</name></author>
            <category term="cs.SD" />
          </entry>
        </feed>
        """
    )

    paper = _paper_from_arxiv_entry(feed.entries[0], dt.date(2026, 6, 1), dt.date(2026, 6, 7))

    assert paper is not None
    assert paper.journal == "arXiv"
    assert paper.url == "https://arxiv.org/abs/2606.01234v1"
    assert paper.publication_stage == "preprint"
    assert paper.source_group == "preprint_filtered"
    assert paper.needs_review is True
    assert paper.matched_keywords == ["cochlear implant", "cochlear implants", "speech perception"]


def test_arxiv_entry_rejects_general_speech_recognition_preprint():
    feed = feedparser.parse(
        """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2606.01235v1</id>
            <published>2026-06-06T00:00:00Z</published>
            <title>A transformer model for automatic speech recognition</title>
            <summary>We improve ASR benchmarks.</summary>
            <author><name>A. Author</name></author>
            <category term="cs.SD" />
          </entry>
        </feed>
        """
    )

    paper = _paper_from_arxiv_entry(feed.entries[0], dt.date(2026, 6, 1), dt.date(2026, 6, 7))

    assert paper is None


def test_arxiv_entry_outside_date_window_is_ignored():
    feed = feedparser.parse(
        """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2605.01234v1</id>
            <published>2026-05-01T00:00:00Z</published>
            <title>Hearing loss and speech perception</title>
            <summary>Relevant but too old for this window.</summary>
            <author><name>A. Author</name></author>
            <category term="cs.SD" />
          </entry>
        </feed>
        """
    )

    paper = _paper_from_arxiv_entry(feed.entries[0], dt.date(2026, 6, 1), dt.date(2026, 6, 7))

    assert paper is None


def test_arxiv_preprints_are_limited_to_latest_three():
    papers = [
        Paper(title=f"Paper {index}", authors=[], journal="arXiv", publication_date=f"2026-06-0{index}", doi=None, url=f"https://arxiv.org/abs/{index}")
        for index in range(1, 6)
    ]

    limited = _limit_arxiv_preprints(papers, {"max_papers_per_update": 3})

    assert [paper.title for paper in limited] == ["Paper 5", "Paper 4", "Paper 3"]
