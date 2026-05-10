from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path

from paper_monitor.classifier import classify
from paper_monitor.config import load_config
from paper_monitor.sources import (
    dedupe_high_impact_papers,
    fetch_crossref,
    fetch_crossref_between,
    fetch_high_impact_crossref,
    fetch_high_impact_crossref_between,
    fetch_high_impact_pubmed,
    fetch_high_impact_pubmed_between,
    fetch_pubmed,
    fetch_pubmed_between,
    fetch_rss,
    fetch_toc,
    merge_dedupe,
)
from paper_monitor.storage import connect, earliest_publication_date, export_json, import_json, upsert_papers

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
    imported = import_json(conn, args.output)
    if imported:
        print(f"Imported {imported} existing JSON records before refresh")
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

    if config.high_impact_journals:
        groups = [
            _safe_fetch("Crossref", "High-impact Journals", lambda: fetch_high_impact_crossref(config, args.days)),
            _safe_fetch("PubMed", "High-impact Journals", lambda: fetch_high_impact_pubmed(config, args.days)),
        ]
        papers = dedupe_high_impact_papers([paper for paper in merge_dedupe(groups) if paper.title])
        changed = upsert_papers(conn, papers)
        total += changed
        print(f"High-impact Journals: {changed} records")

    backfill_window = _backfill_window(conn)
    if backfill_window:
        start_date, end_date = backfill_window
        print(f"Backfill window: {start_date.isoformat()} through {end_date.isoformat()}")
        for journal in config.journals:
            groups = [
                _safe_fetch("Crossref backfill", journal.name, lambda journal=journal: fetch_crossref_between(journal, start_date, end_date)),
                _safe_fetch("PubMed backfill", journal.name, lambda journal=journal: fetch_pubmed_between(journal, start_date, end_date)),
            ]
            papers = [classify(paper, journal, config) for paper in merge_dedupe(groups) if paper.title]
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"{journal.name} backfill: {changed} records")

        if config.high_impact_journals:
            groups = [
                _safe_fetch("Crossref backfill", "High-impact Journals", lambda: fetch_high_impact_crossref_between(config, start_date, end_date)),
                _safe_fetch("PubMed backfill", "High-impact Journals", lambda: fetch_high_impact_pubmed_between(config, start_date, end_date)),
            ]
            papers = dedupe_high_impact_papers([paper for paper in merge_dedupe(groups) if paper.title])
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"High-impact Journals backfill: {changed} records")

    export_json(conn, args.output)
    print(f"Exported {args.output} after processing {total} records")


def _safe_fetch(source: str, journal: str, fn):
    try:
        return fn()
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {exc}")
        return []


def _backfill_window(conn):
    earliest = earliest_publication_date(conn)
    if not earliest:
        return None
    try:
        end_date = dt.date.fromisoformat(earliest) - dt.timedelta(days=1)
    except ValueError:
        return None
    start_date = end_date - dt.timedelta(days=6)
    return start_date, end_date



if __name__ == "__main__":
    main()
