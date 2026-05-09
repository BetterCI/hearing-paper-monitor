from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from paper_monitor.models import normalize_doi
from paper_monitor.storage import connect, import_json

ROOT = Path(__file__).resolve().parents[1]

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "hearing-paper-monitor/0.1 (+https://github.com/BetterCI/hearing-paper-monitor)",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    }
)

IMAGE_META_NAMES = [
    "citation_image",
    "citation_graphical_abstract",
    "dc.image",
    "og:image",
    "twitter:image",
]

FULL_TEXT_META_NAMES = [
    "citation_fulltext_html_url",
    "citation_public_url",
    "citation_abstract_html_url",
    "og:url",
]

BAD_IMAGE_TERMS = [
    "logo",
    "icon",
    "favicon",
    "sprite",
    "cover",
    "ad-",
    "advert",
    "facebook",
    "twitter",
    "linkedin",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich paper JSON with official-page image/formula metadata.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=80, help="Maximum official pages to inspect per run. 0 means no limit.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    inspected = 0
    changed = 0

    for paper in payload.get("papers", []):
        if has_media_metadata(paper):
            continue
        if args.limit and inspected >= args.limit:
            break
        url = landing_url(paper)
        if not url:
            continue
        inspected += 1
        try:
            metadata = enrich_from_page(url)
        except requests.RequestException as exc:
            print(f"Warning: media enrichment failed for {paper.get('doi') or paper.get('title')}: {exc}")
            failed_url = getattr(getattr(exc, "response", None), "url", "") or url
            if failed_url and not paper.get("full_text_url") and not is_pdf_url(failed_url):
                paper["full_text_url"] = failed_url
                changed += 1
            continue
        if apply_metadata(paper, metadata):
            changed += 1
        time.sleep(0.25)

    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    sync_sqlite(args.output)
    print(f"Inspected {inspected} pages; enriched {changed} papers")


def has_media_metadata(paper: dict) -> bool:
    return bool(paper.get("full_text_url") or paper.get("key_image_url") or paper.get("key_formula"))


def landing_url(paper: dict) -> str:
    for candidate in [paper.get("full_text_url"), paper.get("url"), doi_url(paper.get("doi"))]:
        if candidate and not is_pdf_url(candidate):
            return candidate
    return ""


def doi_url(doi: str | None) -> str:
    normalized = normalize_doi(doi)
    return f"https://doi.org/{normalized}" if normalized else ""


def enrich_from_page(url: str) -> dict:
    response = SESSION.get(url, timeout=25, allow_redirects=True)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "html" not in content_type.lower():
        return {}

    soup = BeautifulSoup(response.text, "html.parser")
    base_url = response.url
    return {
        "full_text_url": first_meta_url(soup, FULL_TEXT_META_NAMES, base_url) or base_url,
        "key_image_url": find_key_image(soup, base_url),
        "key_image_alt": find_key_image_alt(soup),
        "key_formula": find_key_formula(soup),
    }


def first_meta_url(soup: BeautifulSoup, names: list[str], base_url: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = tag.get("content", "").strip() if tag else ""
        if content and not is_pdf_url(content):
            return urljoin(base_url, content)
    return ""


def find_key_image(soup: BeautifulSoup, base_url: str) -> str:
    for name in IMAGE_META_NAMES:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = tag.get("content", "").strip() if tag else ""
        url = normalize_image_url(content, base_url)
        if url:
            return url

    scored: list[tuple[int, str]] = []
    for image in soup.find_all("img", src=True):
        src = normalize_image_url(image.get("src", ""), base_url)
        if not src:
            continue
        text = " ".join(
            [
                image.get("alt", ""),
                image.get("class", "") if isinstance(image.get("class"), str) else " ".join(image.get("class", [])),
                src,
            ]
        ).lower()
        score = 0
        for term in ["graphical", "abstract", "figure", "fig.", "equation", "formula", "toc"]:
            if term in text:
                score += 2
        if score:
            scored.append((score, src))
    scored.sort(reverse=True)
    return scored[0][1] if scored else ""


def normalize_image_url(value: str, base_url: str) -> str:
    if not value:
        return ""
    url = urljoin(base_url, value.strip())
    lower = url.lower()
    if not lower.startswith(("http://", "https://")):
        return ""
    if is_pdf_url(url) or any(term in lower for term in BAD_IMAGE_TERMS):
        return ""
    return url


def find_key_image_alt(soup: BeautifulSoup) -> str:
    tag = soup.find("meta", attrs={"property": "og:image:alt"}) or soup.find("meta", attrs={"name": "twitter:image:alt"})
    content = tag.get("content", "").strip() if tag else ""
    return clean_text(content)


def find_key_formula(soup: BeautifulSoup) -> str:
    selectors = [
        "math",
        "script[type='math/tex']",
        "script[type='math/tex; mode=display']",
        ".MathJax",
        ".MathJax_Display",
        ".equation",
        ".formula",
    ]
    for selector in selectors:
        for node in soup.select(selector):
            text = clean_text(node.get_text(" ") or node.string or "")
            if looks_like_formula(text):
                return trim_formula(text)
    return ""


def looks_like_formula(text: str) -> bool:
    if len(text) < 3:
        return False
    if any(token in text for token in ["=", "\\frac", "\\sum", "\\int", "\u2211", "\u222b", "\u2248", "\u2264", "\u2265"]):
        return True
    return bool(re.search(r"\b[a-zA-Z]\s*[=<>]\s*[-+*/()a-zA-Z0-9]", text))


def trim_formula(text: str) -> str:
    return text[:500].strip()


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


def is_pdf_url(url: str) -> bool:
    return bool(re.search(r"\.pdf($|[?#])", str(url), flags=re.I))


def apply_metadata(paper: dict, metadata: dict) -> bool:
    changed = False
    for key in ["full_text_url", "key_image_url", "key_image_alt", "key_formula"]:
        if metadata.get(key) and not paper.get(key):
            paper[key] = metadata[key]
            changed = True
    return changed


def sync_sqlite(json_path: Path) -> None:
    conn = connect(ROOT / "papers.sqlite")
    import_json(conn, json_path)


if __name__ == "__main__":
    main()
