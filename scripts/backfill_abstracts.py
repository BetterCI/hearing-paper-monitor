from __future__ import annotations

import argparse
import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode

import requests

try:
    from paper_monitor.models import normalize_doi
    from paper_monitor.storage import connect, import_json
except ModuleNotFoundError:
    from scripts.paper_monitor.models import normalize_doi
    from scripts.paper_monitor.storage import connect, import_json


ROOT = Path(__file__).resolve().parents[1]
SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "hearing-paper-monitor/0.1 (mailto:example@example.com)",
        "Accept": "application/json, text/xml, */*;q=0.5",
    }
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing abstracts from PubMed by DOI.")
    parser.add_argument("--input", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--db", type=Path, default=ROOT / "papers.sqlite")
    parser.add_argument("--limit", type=int, default=25, help="Maximum missing-abstract records to inspect. 0 means no limit.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    inspected = 0
    updated = 0

    for paper in payload.get("papers", []):
        if paper.get("abstract"):
            continue
        if args.limit and inspected >= args.limit:
            break
        doi = normalize_doi(paper.get("doi"))
        if not doi:
            continue
        inspected += 1
        try:
            abstract = fetch_pubmed_abstract_by_doi(doi)
        except (requests.RequestException, ET.ParseError) as exc:
            print(f"Warning: PubMed abstract backfill failed for {doi}: {exc}")
            continue
        if abstract:
            paper["abstract"] = abstract
            if "pubmed" not in (paper.get("source") or "").lower():
                paper["source"] = f"{paper.get('source') or 'unknown'}+pubmed"
            updated += 1
        time.sleep(0.12)

    if updated:
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        conn = connect(args.db)
        import_json(conn, args.output)

    print(f"PubMed abstract backfill complete: inspected {inspected}, updated {updated}")


def fetch_pubmed_abstract_by_doi(doi: str) -> str | None:
    normalized = normalize_doi(doi)
    if not normalized:
        return None
    pmids = _pubmed_ids_for_doi(normalized)
    if not pmids:
        return None

    params = {"db": "pubmed", "id": ",".join(pmids[:3]), "retmode": "xml"}
    response = _get_with_retry(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?{urlencode(params)}")
    return abstract_from_pubmed_xml(response.text)


def abstract_from_pubmed_xml(xml_text: str) -> str | None:
    root = ET.fromstring(xml_text)
    parts: list[str] = []
    for node in root.findall(".//AbstractText"):
        text = _clean_text("".join(node.itertext()))
        if not text:
            continue
        label = _clean_text(node.attrib.get("Label") or node.attrib.get("NlmCategory") or "")
        if label and not text.lower().startswith(label.lower()):
            parts.append(f"{label}: {text}")
        else:
            parts.append(text)
    return " ".join(parts) or None


def _pubmed_ids_for_doi(doi: str) -> list[str]:
    params = {
        "db": "pubmed",
        "term": f"{doi}[AID]",
        "retmode": "json",
        "retmax": "3",
        "sort": "pub date",
    }
    response = _get_with_retry(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{urlencode(params)}")
    return response.json().get("esearchresult", {}).get("idlist", [])


def _get_with_retry(url: str) -> requests.Response:
    last_error: requests.RequestException | None = None
    for attempt in range(3):
        try:
            response = SESSION.get(url, timeout=25)
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    raise last_error or requests.RequestException(f"Request failed: {url}")


def _clean_text(value: str) -> str:
    return " ".join((value or "").split())


if __name__ == "__main__":
    main()
