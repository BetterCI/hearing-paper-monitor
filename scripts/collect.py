from __future__ import annotations

import argparse
from pathlib import Path

from paper_monitor.classifier import classify
from paper_monitor.config import load_config
from paper_monitor.sources import fetch_crossref, fetch_pubmed, fetch_rss, fetch_toc, merge_dedupe
from paper_monitor.storage import connect, export_json, upsert_papers

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect hearing science paper metadata.")
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "journals.yml")
    parser.add_argument("--db", type=Path, default=ROOT / "papers.sqlite")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--days", type=int, default=45)
    args = parser.parse_args()

    config = load_config(args.config)
    conn = connect(args.db)
    total = 0

    for journal in config.journals:
        days = max(args.days, journal.lookback_days or args.days)
        groups = [
            _safe_fetch("Crossref", journal.name, lambda: fetch_crossref(journal, days)),
            _safe_fetch("PubMed", journal.name, lambda: fetch_pubmed(journal, days)),
            _safe_fetch("RSS", journal.name, lambda: fetch_rss(journal)),
            _safe_fetch("TOC", journal.name, lambda: fetch_toc(journal)),
        ]
        papers = [classify(paper, journal, config) for paper in merge_dedupe(groups) if paper.title]
        changed = upsert_papers(conn, papers)
        total += changed
        print(f"{journal.name}: {changed} records")

    export_json(conn, args.output)
    print(f"Exported {args.output} after processing {total} records")


def _safe_fetch(source: str, journal: str, fn):
    try:
        return fn()
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {exc}")
        return []


if __name__ == "__main__":
    main()
