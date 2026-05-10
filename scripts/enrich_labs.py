from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlparse

import requests
from bs4 import BeautifulSoup

try:
    from paper_monitor.storage import connect, import_json
except ModuleNotFoundError:
    from scripts.paper_monitor.storage import connect, import_json

ROOT = Path(__file__).resolve().parents[1]

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "hearing-paper-monitor/0.1 (+https://github.com/BetterCI/hearing-paper-monitor)",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    }
)

LAB_CUES = (
    "lab",
    "laboratory",
    "research group",
    "research centre",
    "research center",
    "hearing",
    "auditory",
    "cochlear",
    "neuroscience",
    "principal investigator",
    "faculty",
    "people",
    "profile",
)

BAD_DOMAINS = (
    "doi.org",
    "crossref.org",
    "pubmed.ncbi.nlm.nih.gov",
    "ncbi.nlm.nih.gov",
    "sciencedirect.com",
    "springer.com",
    "wiley.com",
    "tandfonline.com",
    "sagepub.com",
    "nature.com",
    "science.org",
    "frontiersin.org",
    "mdpi.com",
    "plos.org",
    "researchgate.net",
    "linkedin.com",
    "scholar.google",
    "orcid.org",
    "semanticscholar.org",
    "x.com",
    "twitter.com",
    "facebook.com",
)


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str = ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Find likely last-author lab homepages for recent papers.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=20, help="Maximum papers to search per run. 0 means no limit.")
    parser.add_argument("--days", type=int, default=14, help="Only inspect papers from this many recent days. 0 means any date.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    papers = payload.get("papers", [])
    inspected = 0
    changed = 0

    for paper in papers:
        if args.limit and inspected >= args.limit:
            break
        if paper.get("last_author_lab_url"):
            continue
        if args.days and not is_recent_paper(paper, args.days):
            continue
        author = last_author_name(paper)
        if not author:
            continue
        inspected += 1
        homepage = find_lab_homepage(author, paper.get("last_author_affiliation") or "")
        if not homepage:
            continue
        paper["last_author_lab_url"] = homepage.url
        paper["last_author_lab_name"] = homepage.title
        paper["last_author_lab_source"] = "web_search"
        changed += 1
        time.sleep(0.4)

    if changed:
        args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        sync_sqlite(args.output)
    print(f"Lab homepage enrichment complete: inspected {inspected}, updated {changed}")


def find_lab_homepage(author: str, affiliation: str = "") -> SearchResult | None:
    for query in search_queries(author, affiliation):
        try:
            results = search_duckduckgo(query)
        except requests.RequestException as exc:
            print(f"Warning: lab search failed for {author}: {exc}")
            return None
        for result in results:
            if plausible_lab_result(result, author, affiliation) and confirm_lab_page(result, author, affiliation):
                return result
        time.sleep(0.2)
    return None


def search_queries(author: str, affiliation: str = "") -> list[str]:
    institution = institution_hint(affiliation)
    queries = []
    if institution:
        queries.append(f'"{author}" "{institution}" lab')
        queries.append(f'"{author}" "{institution}" research group')
    queries.append(f'"{author}" hearing lab')
    queries.append(f'"{author}" auditory lab')
    return list(dict.fromkeys(queries))


def search_duckduckgo(query: str) -> list[SearchResult]:
    url = "https://duckduckgo.com/html/?" + urlencode({"q": query})
    response = SESSION.get(url, timeout=25)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    results: list[SearchResult] = []
    for node in soup.select(".result"):
        link = node.select_one(".result__a")
        if not link:
            continue
        href = clean_search_url(link.get("href", ""))
        title = clean_text(link.get_text(" "))
        snippet = clean_text(" ".join(part.get_text(" ") for part in node.select(".result__snippet")))
        if href and title:
            results.append(SearchResult(title=title, url=href, snippet=snippet))
    return results[:8]


def plausible_lab_result(result: SearchResult, author: str, affiliation: str = "") -> bool:
    domain = urlparse(result.url).netloc.lower()
    if not domain or any(bad in domain for bad in BAD_DOMAINS):
        return False
    text = f"{result.title} {result.snippet} {unquote(result.url)}".lower()
    surname = author_surname(author)
    has_author = bool(surname and surname.lower() in text)
    has_lab_cue = any(cue in text for cue in LAB_CUES)
    has_institution = any(term in text for term in affiliation_terms(affiliation))
    academic_domain = bool(re.search(r"(\.edu|\.ac\.|university|hospital|institute|clinic)", domain))
    score = (4 if has_author else 0) + (2 if has_lab_cue else 0) + (2 if has_institution else 0) + (2 if academic_domain else 0)
    return score >= 6 and has_author and (has_lab_cue or has_institution)


def confirm_lab_page(result: SearchResult, author: str, affiliation: str = "") -> bool:
    try:
        response = SESSION.get(result.url, timeout=20, allow_redirects=True)
        response.raise_for_status()
    except requests.RequestException:
        return False
    content_type = response.headers.get("content-type", "")
    if "html" not in content_type.lower():
        return False
    text = clean_text(BeautifulSoup(response.text[:500_000], "html.parser").get_text(" ")).lower()
    surname = author_surname(author).lower()
    has_author = bool(surname and surname in text)
    has_lab_cue = any(cue in text for cue in LAB_CUES)
    has_institution = any(term in text for term in affiliation_terms(affiliation))
    return has_author and (has_lab_cue or has_institution)


def last_author_name(paper: dict) -> str:
    authors = [clean_text(str(author)) for author in paper.get("authors") or [] if clean_text(str(author))]
    return authors[-1] if authors else ""


def is_recent_paper(paper: dict, days: int) -> bool:
    date_string = paper.get("available_online_date") or paper.get("publication_date") or ""
    try:
        paper_date = dt.date.fromisoformat(date_string[:10])
    except ValueError:
        return False
    return paper_date >= dt.date.today() - dt.timedelta(days=days)


def institution_hint(affiliation: str) -> str:
    for part in affiliation_parts(affiliation):
        lower = part.lower()
        if any(term in lower for term in ("university", "hospital", "institute", "college", "clinic", "center", "centre")):
            return part
    return affiliation_parts(affiliation)[0] if affiliation_parts(affiliation) else ""


def affiliation_terms(affiliation: str) -> list[str]:
    terms = []
    for part in affiliation_parts(affiliation):
        lower = part.lower()
        if len(lower) >= 5 and not lower.startswith(("department of", "school of", "faculty of")):
            terms.append(lower)
    return terms[:3]


def affiliation_parts(affiliation: str) -> list[str]:
    return [clean_text(part) for part in re.split(r"[,;]", affiliation or "") if clean_text(part)]


def author_surname(author: str) -> str:
    parts = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", author)
    return parts[-1] if parts else ""


def clean_search_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        return unquote(target)
    return url


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


def sync_sqlite(json_path: Path) -> None:
    conn = connect(ROOT / "papers.sqlite")
    import_json(conn, json_path)


if __name__ == "__main__":
    main()
