from __future__ import annotations

import argparse
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
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
        "Accept": "application/xml,text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
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

OPEN_ACCESS_META_NAMES = [
    "citation_open_access",
    "citation_free_to_read",
]

LICENSE_META_NAMES = [
    "citation_license",
    "dc.rights",
    "dc.rights.uri",
    "license",
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
    "card-share",
    "pmc-card-share",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich paper JSON with official-page image/formula metadata.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--limit", type=int, default=80, help="Maximum official pages to inspect per run. 0 means no limit.")
    parser.add_argument("--pubmed-full-text-only", action="store_true", help="Only inspect PubMed/PMC full-text records missing images.")
    parser.add_argument("--open-access-only", action="store_true", help="Only inspect open-access records missing images.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    inspected = 0
    changed = 0

    for paper in payload.get("papers", []):
        if args.pubmed_full_text_only and not needs_pubmed_full_text_image(paper):
            continue
        if args.open_access_only and not needs_open_access_image(paper):
            continue
        if has_media_metadata(paper):
            continue
        if args.limit and inspected >= args.limit:
            break
        url = landing_url(paper)
        if not url:
            continue
        inspected += 1
        try:
            if needs_pubmed_full_text_image(paper):
                metadata = enrich_pubmed_full_text_image(paper)
            elif needs_open_access_image(paper):
                metadata = enrich_open_access_image(paper)
            else:
                metadata = enrich_from_page(url)
        except requests.RequestException as exc:
            print(f"Warning: media enrichment failed for {paper.get('doi') or paper.get('title')}: {exc}")
            failed_url = getattr(getattr(exc, "response", None), "url", "") or url
            if failed_url and not paper.get("full_text_url") and not is_pdf_url(failed_url):
                paper["full_text_url"] = failed_url
                changed += 1
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {403, 404, 410} and not paper.get("media_checked_at"):
                paper["media_checked_at"] = utc_now()
                changed += 1
            if status_code in {403, 404, 410} and needs_open_access_image(paper):
                paper["open_access_image_checked_at"] = utc_now()
                changed += 1
            continue
        if apply_metadata(paper, metadata):
            changed += 1
        time.sleep(0.25)

    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    sync_sqlite(args.output)
    print(f"Inspected {inspected} pages; enriched {changed} papers")


def has_media_metadata(paper: dict) -> bool:
    if needs_pubmed_full_text_image(paper) or needs_open_access_image(paper):
        return False
    return bool(paper.get("key_image_url") or paper.get("key_formula") or paper.get("media_checked_at"))


def needs_pubmed_full_text_image(paper: dict) -> bool:
    return bool(
        paper.get("pubmed_full_text_available")
        and paper.get("pubmed_full_text_url")
        and not paper.get("key_image_url")
        and not paper.get("pubmed_full_text_image_checked_at")
    )


def needs_open_access_image(paper: dict) -> bool:
    return bool(
        paper.get("open_access")
        and not paper.get("key_image_url")
        and not paper.get("open_access_image_checked_at")
    )


def landing_url(paper: dict) -> str:
    for candidate in [paper.get("pubmed_full_text_url"), paper.get("open_access_url"), paper.get("full_text_url"), paper.get("url"), doi_url(paper.get("doi"))]:
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
    license_url = find_license_url(soup, base_url)
    open_access = is_open_access_page(soup, base_url, license_url)
    return {
        "full_text_url": first_meta_url(soup, FULL_TEXT_META_NAMES, base_url) or base_url,
        "open_access": open_access,
        "open_access_url": base_url if open_access else "",
        "open_access_source": "page_license" if open_access and license_url else ("page_metadata" if open_access else ""),
        "license_url": license_url,
        "media_checked_at": utc_now(),
        "key_image_url": find_key_image(soup, base_url),
        "key_image_alt": find_key_image_alt(soup),
        "key_formula": find_key_formula(soup),
    }


def enrich_pubmed_full_text_image(paper: dict) -> dict:
    checked_at = utc_now()
    metadata = {}
    pmc_id = extract_pmc_id(paper.get("pubmed_full_text_url") or paper.get("open_access_url") or "")
    if pmc_id:
        try:
            metadata.update(enrich_from_europe_pmc_xml(pmc_id))
            metadata["media_checked_at"] = checked_at
            metadata["pubmed_full_text_image_checked_at"] = checked_at
        except requests.RequestException as exc:
            print(f"Warning: Europe PMC figure lookup failed for {pmc_id}: {exc}")
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                metadata["media_checked_at"] = checked_at
                metadata["pubmed_full_text_image_checked_at"] = checked_at
                if paper.get("open_access"):
                    metadata["open_access_image_checked_at"] = checked_at
        except ET.ParseError as exc:
            print(f"Warning: Europe PMC XML parsing failed for {pmc_id}: {exc}")
    return metadata


def enrich_open_access_image(paper: dict) -> dict:
    checked_at = utc_now()
    metadata = enrich_from_page(landing_url(paper))
    metadata["media_checked_at"] = metadata.get("media_checked_at") or checked_at
    metadata["open_access_image_checked_at"] = checked_at
    return metadata


def enrich_from_europe_pmc_xml(pmc_id: str) -> dict:
    response = SESSION.get(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc_id}/fullTextXML", timeout=25)
    response.raise_for_status()
    return figure_metadata_from_pmc_xml(response.text, pmc_id)


def figure_metadata_from_pmc_xml(xml_text: str, pmc_id: str) -> dict:
    root = ET.fromstring(xml_text.encode("utf-8"))
    figures = list(root.iterfind(".//fig"))
    if not figures:
        return {}
    figure = sorted(figures, key=figure_rank)[0]
    href = figure_graphic_href(figure)
    if not href:
        return {}
    label = clean_text("".join(figure.findtext("label") or ""))
    caption_node = figure.find("caption")
    caption = clean_text("".join(caption_node.itertext())) if caption_node is not None else ""
    alt = clean_text(" ".join(part for part in [label, caption] if part))
    return {
        "key_image_url": pmc_image_url(pmc_id, href),
        "key_image_alt": alt or "Figure 1 from the PubMed Central full text",
    }


def figure_rank(figure: ET.Element) -> tuple[int, int]:
    figure_id = (figure.attrib.get("id") or "").lower()
    label = clean_text("".join(figure.findtext("label") or "")).lower()
    text = f"{figure_id} {label}"
    is_figure_1 = bool(re.search(r"\b(fig(?:ure)?[.\s-]*1|f1)\b", text))
    return (0 if is_figure_1 else 1, 0)


def figure_graphic_href(figure: ET.Element) -> str:
    graphics = [node for node in figure.iter() if node.tag.endswith("graphic")]
    preferred = sorted(graphics, key=lambda node: 0 if node.attrib.get("content-type") == "image" else 1)
    for graphic in preferred:
        for key, value in graphic.attrib.items():
            if key.endswith("href") and value:
                return value
    return ""


def pmc_image_url(pmc_id: str, href: str) -> str:
    return f"https://pmc.ncbi.nlm.nih.gov/articles/{normalize_pmc_id(pmc_id)}/bin/{href}"


def extract_pmc_id(url: str) -> str:
    match = re.search(r"\bPMC?\d+\b", url or "", flags=re.I)
    return normalize_pmc_id(match.group(0)) if match else ""


def normalize_pmc_id(value: str) -> str:
    value = (value or "").strip().upper()
    if value and not value.startswith("PMC"):
        value = f"PMC{value.removeprefix('PM')}"
    return value


def first_meta_url(soup: BeautifulSoup, names: list[str], base_url: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = tag.get("content", "").strip() if tag else ""
        if content and not is_pdf_url(content):
            return urljoin(base_url, content)
    return ""


def find_license_url(soup: BeautifulSoup, base_url: str) -> str:
    for name in LICENSE_META_NAMES:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = tag.get("content", "").strip() if tag else ""
        if content and "http" in content.lower():
            return urljoin(base_url, content)

    for tag in soup.find_all("link", href=True):
        rel = " ".join(tag.get("rel", [])).lower() if isinstance(tag.get("rel"), list) else str(tag.get("rel", "")).lower()
        href = tag.get("href", "").strip()
        if "license" in rel and href:
            return urljoin(base_url, href)

    for tag in soup.find_all("a", href=True):
        href = tag.get("href", "").strip()
        if "creativecommons.org" in href.lower():
            return urljoin(base_url, href)
    return ""


def is_open_access_page(soup: BeautifulSoup, base_url: str, license_url: str) -> bool:
    if "pmc.ncbi.nlm.nih.gov" in base_url.lower():
        return True
    if is_open_license_url(license_url):
        return True
    for name in OPEN_ACCESS_META_NAMES:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = (tag.get("content", "") if tag else "").strip().lower()
        if content in {"true", "yes", "y", "1", "open", "free", "free_to_read"}:
            return True
    return False


def is_open_license_url(url: str) -> bool:
    value = (url or "").lower()
    return "creativecommons.org" in value or "open-access" in value or "openaccess" in value


def find_key_image(soup: BeautifulSoup, base_url: str) -> str:
    for name in IMAGE_META_NAMES:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        content = tag.get("content", "").strip() if tag else ""
        url = normalize_image_url(content, base_url)
        if url:
            return url

    figure_one = find_figure_one_image(soup, base_url)
    if figure_one:
        return figure_one

    scored: list[tuple[int, str]] = []
    seen: set[str] = set()
    preferred_images = []
    for selector in ["figure img[src]", ".figure img[src]", ".fig img[src]", "article img[src]", "[class*='fig'] img[src]"]:
        preferred_images.extend(soup.select(selector))
    for image in [*preferred_images, *soup.find_all("img", src=True)]:
        src = normalize_image_url(image.get("src", ""), base_url)
        if not src or src in seen:
            continue
        seen.add(src)
        text = " ".join(
            [
                image.get("alt", ""),
                image.get("class", "") if isinstance(image.get("class"), str) else " ".join(image.get("class", [])),
                src,
            ]
        ).lower()
        score = 0
        if image in preferred_images:
            score += 1
        for term in ["graphical", "abstract", "figure", "fig.", "equation", "formula", "toc"]:
            if term in text:
                score += 2
        if score:
            scored.append((score, src))
    scored.sort(reverse=True)
    return scored[0][1] if scored else ""


def find_figure_one_image(soup: BeautifulSoup, base_url: str) -> str:
    candidates = []
    candidates.extend(soup.select("figure, .figure, .fig, [id*='fig'], [id*='Fig'], [id^='F']"))
    for container in candidates:
        text = " ".join(
            [
                container.get("id", ""),
                " ".join(container.get("class", [])) if isinstance(container.get("class"), list) else str(container.get("class", "")),
                clean_text(container.get_text(" "))[:300],
            ]
        ).lower()
        if not re.search(r"\b(fig(?:ure)?[.\s-]*1|f1)\b", text):
            continue
        for image in container.find_all("img", src=True):
            url = normalize_image_url(image.get("src", ""), base_url)
            if url:
                return url
    return ""


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
    for key in ["open_access_url", "open_access_source", "media_checked_at", "pubmed_full_text_image_checked_at", "open_access_image_checked_at"]:
        if metadata.get(key) and not paper.get(key):
            paper[key] = metadata[key]
            changed = True
    if metadata.get("license_url") and (metadata.get("open_access") or paper.get("open_access")) and not paper.get("license_url"):
        paper["license_url"] = metadata["license_url"]
        changed = True
    if metadata.get("open_access") and not paper.get("open_access"):
        paper["open_access"] = True
        changed = True
    return changed


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sync_sqlite(json_path: Path) -> None:
    conn = connect(ROOT / "papers.sqlite")
    import_json(conn, json_path)


if __name__ == "__main__":
    main()
