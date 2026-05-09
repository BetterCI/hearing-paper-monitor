from __future__ import annotations

import datetime as dt
import html
import re
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Iterable
from urllib.parse import urlencode

import feedparser
import requests
from bs4 import BeautifulSoup

from .config import Journal
from .models import Paper, normalize_doi, normalize_journal_name

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "hearing-paper-monitor/0.1 (mailto:example@example.com)",
        "Accept": "application/json, text/xml, text/html;q=0.8, */*;q=0.5",
    }
)

EARLY_ACCESS_STAGE = "early_access"

EARLY_ACCESS_CUES = (
    "early access",
    "online first",
    "article in press",
    "articles in press",
    "publish ahead",
    "published ahead",
    "ahead of print",
    "aheadofprint",
    "advance online",
    "advance article",
    "publish-ahead-of-print",
    "published-ahead-of-print",
)

ONLINE_ONLY_JOURNALS = {
    "Trends in Hearing",
}


def fetch_crossref(journal: Journal, days: int) -> list[Paper]:
    if not journal.crossref:
        return []
    cutoff = dt.date.today() - dt.timedelta(days=days)
    papers: list[Paper] = []

    for issn in journal.issn:
        for date_filter in ("from-pub-date", "from-online-pub-date"):
            params = {
                "filter": f"{date_filter}:{cutoff.isoformat()},type:journal-article",
                "sort": "published",
                "order": "desc",
                "rows": "100",
                "mailto": "example@example.com",
            }
            url = f"https://api.crossref.org/journals/{issn}/works?{urlencode(params)}"
            try:
                data = _get_json(url)
            except requests.HTTPError as exc:
                print(f"Warning: Crossref ISSN {issn} {date_filter} failed for {journal.name}: {exc}")
                continue
            for item in data.get("message", {}).get("items", []):
                paper = _paper_from_crossref(item, journal)
                if paper:
                    papers.append(paper)
            time.sleep(0.15)

    return papers


def fetch_pubmed(journal: Journal, days: int) -> list[Paper]:
    if not journal.pubmed:
        return []

    end_date = dt.date.today()
    start_date = end_date - dt.timedelta(days=days)
    query = " OR ".join(f'"{alias}"[Journal]' for alias in journal.aliases)
    date_range = f"{start_date:%Y/%m/%d}:{end_date:%Y/%m/%d}[Date - Publication]"
    params = {
        "db": "pubmed",
        "term": f"({query}) AND ({date_range})",
        "retmode": "json",
        "retmax": "200",
        "sort": "pub date",
    }
    search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    ids = _get_json(f"{search_url}?{urlencode(params)}").get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []

    fetch_params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "xml",
    }
    xml_text = SESSION.get(
        f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?{urlencode(fetch_params)}",
        timeout=30,
    ).text
    root = ET.fromstring(xml_text)
    return [_paper_from_pubmed(article, journal) for article in root.findall(".//PubmedArticle")]


def fetch_rss(journal: Journal) -> list[Paper]:
    papers: list[Paper] = []
    for url in journal.rss:
        feed = feedparser.parse(url)
        for entry in feed.entries:
            title = _clean(getattr(entry, "title", ""))
            if not title:
                continue
            doi = _extract_doi(" ".join(str(getattr(entry, key, "")) for key in ("id", "link", "summary")))
            published = _rss_date(entry)
            papers.append(
                Paper(
                    title=title,
                    authors=[author.get("name", "") for author in getattr(entry, "authors", []) if author.get("name")],
                    journal=normalize_journal_name(journal.name),
                    publication_date=published,
                    doi=doi,
                    url=_official_url(getattr(entry, "link", ""), doi),
                    abstract=_clean(getattr(entry, "summary", "")) or None,
                    publication_stage=_text_publication_stage(
                        " ".join(str(getattr(entry, key, "")) for key in ("title", "link", "summary", "tags"))
                    )
                    or _date_publication_stage(published),
                    source="rss",
                )
            )
    return papers


def fetch_toc(journal: Journal) -> list[Paper]:
    papers: list[Paper] = []
    for url in journal.toc:
        response = SESSION.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for link in soup.select("a[href]"):
            title = _clean(link.get_text(" "))
            href = link.get("href", "")
            doi = _extract_doi(href)
            if not title or len(title) < 20 or not doi:
                continue
            papers.append(
                Paper(
                    title=title,
                    authors=[],
                    journal=normalize_journal_name(journal.name),
                    publication_date=dt.date.today().isoformat(),
                    doi=doi,
                    url=_official_url(href, doi),
                    publication_stage=_text_publication_stage(f"{title} {href} {url}") or _date_publication_stage(dt.date.today().isoformat()),
                    source="toc",
                )
            )
    return papers


def merge_dedupe(groups: Iterable[list[Paper]]) -> list[Paper]:
    merged: dict[str, Paper] = {}
    for group in groups:
        for paper in group:
            key = paper.identity
            existing = merged.get(key)
            if existing is None:
                merged[key] = paper
                continue
            existing.abstract = existing.abstract or paper.abstract
            existing.section = existing.section or paper.section
            existing.publication_stage = existing.publication_stage or paper.publication_stage
            existing.keywords = sorted(set(existing.keywords + paper.keywords))
            existing.authors = existing.authors or paper.authors
            existing.url = _prefer_url(existing.url, paper.url, existing.doi)
            if existing.source != paper.source:
                existing.source = f"{existing.source}+{paper.source}"
    return list(merged.values())


def _paper_from_crossref(item: dict, journal: Journal) -> Paper | None:
    titles = item.get("title") or []
    if not titles:
        return None
    doi = normalize_doi(item.get("DOI"))
    abstract = _clean(item.get("abstract", "")) or None
    subjects = item.get("subject") or []
    journal_name = normalize_journal_name(_clean((item.get("container-title") or [journal.name])[0]))
    publication_date = _crossref_date(item)
    return Paper(
        title=_clean(titles[0]),
        authors=_crossref_authors(item.get("author", [])),
        journal=journal_name,
        publication_date=publication_date,
        doi=doi,
        url=_official_url(item.get("URL", ""), doi),
        abstract=abstract,
        first_author_affiliation=_crossref_first_author_affiliation(item.get("author", [])),
        publication_stage=_crossref_publication_stage(item, journal_name, publication_date),
        keywords=subjects,
        source="crossref",
    )


def _paper_from_pubmed(article: ET.Element, journal: Journal) -> Paper:
    citation = article.find(".//MedlineCitation")
    title = _clean("".join(citation.find(".//ArticleTitle").itertext())) if citation is not None else ""
    abstract_parts = [
        _clean("".join(node.itertext()))
        for node in article.findall(".//AbstractText")
        if _clean("".join(node.itertext()))
    ]
    doi = None
    for node in article.findall(".//ArticleId"):
        if node.attrib.get("IdType") == "doi":
            doi = normalize_doi(node.text)
            break
    pmid = article.findtext(".//PMID")
    keywords = [_clean("".join(node.itertext())) for node in article.findall(".//Keyword")]
    publication_date = _pubmed_date(article)
    return Paper(
        title=title,
        authors=_pubmed_authors(article.findall(".//Author")),
        journal=normalize_journal_name(journal.name),
        publication_date=publication_date,
        doi=doi,
        url=f"https://doi.org/{doi}" if doi else f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        abstract=" ".join(abstract_parts) or None,
        first_author_affiliation=_pubmed_first_author_affiliation(article.findall(".//Author")),
        publication_stage=_pubmed_publication_stage(article, publication_date),
        keywords=[kw for kw in keywords if kw],
        source="pubmed",
    )


def _crossref_authors(authors: list[dict]) -> list[str]:
    names = []
    for author in authors:
        given = author.get("given", "")
        family = author.get("family", "")
        name = " ".join(part for part in [given, family] if part).strip()
        if name:
            names.append(name)
    return names


def _crossref_first_author_affiliation(authors: list[dict]) -> str | None:
    if not authors:
        return None
    affiliations = authors[0].get("affiliation") or []
    for affiliation in affiliations:
        name = _clean(affiliation.get("name", ""))
        if name:
            return name
    return None


def _pubmed_authors(authors: list[ET.Element]) -> list[str]:
    names = []
    for author in authors:
        collective = author.findtext("CollectiveName")
        if collective:
            names.append(collective)
            continue
        fore = author.findtext("ForeName") or ""
        last = author.findtext("LastName") or ""
        name = " ".join(part for part in [fore, last] if part).strip()
        if name:
            names.append(name)
    return names


def _pubmed_first_author_affiliation(authors: list[ET.Element]) -> str | None:
    if not authors:
        return None
    for node in authors[0].findall(".//Affiliation"):
        affiliation = _clean("".join(node.itertext()))
        if affiliation:
            return affiliation
    return None


def _crossref_date(item: dict) -> str:
    for key in ("published-online", "published-print", "published"):
        date_parts = item.get(key, {}).get("date-parts", [])
        if date_parts and date_parts[0]:
            parts = date_parts[0]
            year = parts[0]
            month = parts[1] if len(parts) > 1 else 1
            day = parts[2] if len(parts) > 2 else 1
            return dt.date(year, month, day).isoformat()
    return dt.date.today().isoformat()


def _pubmed_date(article: ET.Element) -> str:
    pub_date = article.find(".//Article/Journal/JournalIssue/PubDate")
    if pub_date is None:
        return dt.date.today().isoformat()
    year = int(pub_date.findtext("Year") or dt.date.today().year)
    month = _month_to_int(pub_date.findtext("Month") or "1")
    day = int(pub_date.findtext("Day") or 1)
    return dt.date(year, month, day).isoformat()


def _crossref_publication_stage(item: dict, journal_name: str, publication_date: str) -> str | None:
    date_stage = _date_publication_stage(publication_date)
    if date_stage:
        return date_stage

    text_values = []
    for key in ("title", "subtitle", "short-container-title", "subject"):
        value = item.get(key)
        if isinstance(value, list):
            text_values.extend(str(part) for part in value)
        elif value:
            text_values.append(str(value))
    for key in ("subtype", "type"):
        if item.get(key):
            text_values.append(str(item[key]))
    text_stage = _text_publication_stage(" ".join(text_values))
    if text_stage:
        return text_stage

    has_online_date = _has_crossref_date(item, "published-online")
    has_print_date = _has_crossref_date(item, "published-print")
    has_issue_assignment = any(item.get(key) for key in ("volume", "issue", "page"))
    if has_online_date and not has_print_date and not has_issue_assignment and journal_name not in ONLINE_ONLY_JOURNALS:
        return EARLY_ACCESS_STAGE
    return None


def _pubmed_publication_stage(article: ET.Element, publication_date: str) -> str | None:
    date_stage = _date_publication_stage(publication_date)
    if date_stage:
        return date_stage

    article_node = article.find(".//Article")
    text_values = [node.text or "" for node in article.findall(".//PublicationStatus")]
    if article_node is not None:
        text_values.append(article_node.attrib.get("PubModel", ""))
    text_values.extend(_clean("".join(node.itertext())) for node in article.findall(".//PublicationType"))
    return _text_publication_stage(" ".join(text_values))


def _text_publication_stage(value: str) -> str | None:
    text = (value or "").lower().replace("_", " ").replace("-", " ")
    return EARLY_ACCESS_STAGE if any(cue.replace("-", " ") in text for cue in EARLY_ACCESS_CUES) else None


def _date_publication_stage(date_string: str | None) -> str | None:
    try:
        publication_date = dt.date.fromisoformat(date_string or "")
    except ValueError:
        return None
    return EARLY_ACCESS_STAGE if publication_date > dt.date.today() else None


def _has_crossref_date(item: dict, key: str) -> bool:
    date_parts = item.get(key, {}).get("date-parts", [])
    return bool(date_parts and date_parts[0])


def _rss_date(entry) -> str:
    for attr in ("published", "updated"):
        value = getattr(entry, attr, None)
        if value:
            try:
                return parsedate_to_datetime(value).date().isoformat()
            except (TypeError, ValueError):
                pass
    return dt.date.today().isoformat()


def _month_to_int(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        try:
            return dt.datetime.strptime(value[:3], "%b").month
        except ValueError:
            return 1


def _get_json(url: str) -> dict:
    response = SESSION.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def _clean(value: str) -> str:
    value = html.unescape(value or "")
    if "<" not in value and ">" not in value:
        return " ".join(value.split())
    soup = BeautifulSoup(html.unescape(value or ""), "html.parser")
    return " ".join(soup.get_text(" ").split())


def _extract_doi(value: str) -> str | None:
    match = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", value or "")
    return normalize_doi(match.group(0)) if match else None


def _official_url(url: str, doi: str | None) -> str:
    if doi:
        return f"https://doi.org/{doi}"
    return url


def _prefer_url(left: str, right: str, doi: str | None) -> str:
    if doi:
        return f"https://doi.org/{doi}"
    return left or right
