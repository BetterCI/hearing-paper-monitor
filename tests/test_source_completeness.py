import datetime as dt
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path("scripts").resolve()))
from paper_monitor import sources
from paper_monitor.config import Journal
from paper_monitor.models import Paper
from collect import _journal_source_status, _safe_fetch_with_status

JOURNAL = Journal(key="test", name="Test", aliases=["Test"], issn=["1234-5678"])


def paper(index=0):
    return Paper(title=f"Paper {index}", authors=[], journal="Test", publication_date="2026-01-01", doi=f"10.0000/{index}", url="https://example.com")


def test_crossref_paginates_and_includes_late_deposits(monkeypatch):
    urls = []
    monkeypatch.setattr(sources.time, "sleep", lambda _: None)
    monkeypatch.setattr(sources, "_paper_from_crossref", lambda item, journal: paper(item["id"]))

    def get(url):
        query = parse_qs(urlparse(url).query)
        urls.append(query)
        assert query["sort"] == ["created"]  # published sorting is incompatible with Crossref cursors
        if "from-created-date" in query["filter"][0]:
            return {"message": {"items": [{"id": 999}], "next-cursor": "done"}}
        if query["cursor"] == ["*"]:
            return {"message": {"items": [{"id": n} for n in range(100)], "next-cursor": "page-2"}}
        return {"message": {"items": [{"id": 100}], "next-cursor": "done"}}
    monkeypatch.setattr(sources, "_get_json", get)
    result = sources.fetch_crossref_between(JOURNAL, dt.date(2026,9,1), dt.date(2026,10,4))
    assert len(result) == 102  # two publication-date queries are deduplicated
    assert any(p.doi == "10.0000/999" and p.publication_date == "2026-01-01" for p in result)
    assert sum(q["cursor"] == ["page-2"] for q in urls) == 2


def test_partial_crossref_failure_retains_other_pages(monkeypatch):
    monkeypatch.setattr(sources.time, "sleep", lambda _: None)
    monkeypatch.setattr(sources, "_paper_from_crossref", lambda item, journal: paper())
    def get(url):
        if "from-online-pub-date" in url:
            raise requests.Timeout()
        return {"message": {"items": [{"id": 0}]}}
    monkeypatch.setattr(sources, "_get_json", get)
    result, ok = _safe_fetch_with_status("Crossref", "Test", lambda: sources.fetch_crossref(JOURNAL, 14))
    assert not ok
    assert len(result) == 1
    status = _journal_source_status(JOURNAL, 60, [("Crossref", result, ok), ("PubMed", [], True)], result, 1, {"last_success_at":"2026-10-01T00:00:00Z"})
    assert status["state"] == "partial"
    assert status["last_success_at"] == "2026-10-01T00:00:00Z"


def test_pubmed_search_and_article_fetch_are_both_paged(monkeypatch):
    monkeypatch.setattr(sources.time, "sleep", lambda _: None)
    searches, batches = [], []
    def search(url):
        params = parse_qs(urlparse(url).query)
        searches.append(params)
        start = int(params["retstart"][0])
        return {"esearchresult":{"count":"201", "idlist":[str(n) for n in range(start, min(start+200,201))]}}
    def fetch(url):
        ids = parse_qs(urlparse(url).query)["id"][0].split(",")
        batches.append(len(ids))
        return Mock(text="<PubmedArticleSet>" + "".join(f"<PubmedArticle><PMID>{n}</PMID></PubmedArticle>" for n in ids) + "</PubmedArticleSet>")
    monkeypatch.setattr(sources,"_get_json", search)
    monkeypatch.setattr(sources,"_get_response", fetch)
    monkeypatch.setattr(sources,"_paper_from_pubmed", lambda article,journal: paper(int(article.findtext("PMID"))))
    result = sources.fetch_pubmed(JOURNAL,60)
    assert len(result) == 201
    assert batches == [100,100,1]
    assert len(searches) == 2
    assert "[Create Date]" in searches[0]["term"][0]


def test_source_http_retry_avoids_retrying_auth_errors(monkeypatch):
    monkeypatch.setattr(sources.time, "sleep", lambda _: None)
    unavailable = Mock(status_code=503)
    unavailable.raise_for_status.side_effect = requests.HTTPError(response=unavailable)
    okay = Mock(status_code=200)
    monkeypatch.setattr(sources.SESSION, "get", Mock(side_effect=[unavailable,okay]))
    assert sources._get_response("https://example.com") is okay
    denied = Mock(status_code=403)
    denied.raise_for_status.side_effect = requests.HTTPError(response=denied)
    monkeypatch.setattr(sources.SESSION,"get",Mock(return_value=denied))
    with pytest.raises(requests.HTTPError):
        sources._get_response("https://example.com")
    assert sources.SESSION.get.call_count == 1


def test_partial_topic_source_retains_relevant_papers_without_leaking_unfiltered_records(monkeypatch):
    relevant = paper(1)
    relevant.title = "Hearing aid benefits"
    unrelated = paper(2)
    unrelated.title = "Fluid bubble dynamics"
    fetch = Mock(side_effect=sources.SourceFetchError([relevant, unrelated], ["Partial source"]))
    monkeypatch.setattr(sources, "fetch_crossref_between", fetch)
    config = SimpleNamespace(topic_filtered_journals=[JOURNAL])
    result, ok = _safe_fetch_with_status("Crossref", "Topics", lambda: sources.fetch_topic_filtered_crossref(config,14))
    assert not ok
    assert len(result) == 1
    assert result[0].title == relevant.title
    assert result[0].source_group == "topic_filtered"
