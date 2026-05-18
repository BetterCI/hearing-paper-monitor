from __future__ import annotations

import argparse
import datetime as dt
import json
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
from paper_monitor.storage import connect, export_json, import_json, upsert_papers

ROOT = Path(__file__).resolve().parents[1]
BACKFILL_PRIORITY_SECTION_JOURNALS = {"jasa", "jasael"}
BACKFILL_WINDOW_DAYS = 7


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect hearing science paper metadata.")
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "journals.yml")
    parser.add_argument("--db", type=Path, default=ROOT / "papers.sqlite")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "papers.json")
    parser.add_argument("--backfill-state", type=Path, default=ROOT / "data" / "backfill_state.json")
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

    backfill_window = _backfill_window(args.backfill_state, args.days)
    if backfill_window:
        start_date, end_date = backfill_window
        backfill_complete = True
        print(f"Backfill window: {start_date.isoformat()} through {end_date.isoformat()}")
        for journal in config.journals:
            fetches = [
                _safe_fetch_with_status("Crossref backfill", journal.name, lambda journal=journal: fetch_crossref_between(journal, start_date, end_date)),
                _safe_fetch_with_status("PubMed backfill", journal.name, lambda journal=journal: fetch_pubmed_between(journal, start_date, end_date)),
            ]
            backfill_complete = backfill_complete and all(ok for _, ok in fetches)
            groups = [papers for papers, _ in fetches]
            papers = _backfill_papers_for_journal(
                [classify(paper, journal, config) for paper in merge_dedupe(groups) if paper.title],
                journal,
            )
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"{journal.name} backfill: {changed} records")

        if config.high_impact_journals:
            fetches = [
                _safe_fetch_with_status("Crossref backfill", "High-impact Journals", lambda: fetch_high_impact_crossref_between(config, start_date, end_date)),
                _safe_fetch_with_status("PubMed backfill", "High-impact Journals", lambda: fetch_high_impact_pubmed_between(config, start_date, end_date)),
            ]
            backfill_complete = backfill_complete and all(ok for _, ok in fetches)
            groups = [papers for papers, _ in fetches]
            papers = dedupe_high_impact_papers([paper for paper in merge_dedupe(groups) if paper.title])
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"High-impact Journals backfill: {changed} records")

        if backfill_complete:
            _save_backfill_state(args.backfill_state, start_date, end_date)
        else:
            print("Backfill state not advanced because one or more backfill fetches failed")

    export_json(conn, args.output)
    print(f"Exported {args.output} after processing {total} records")


def _safe_fetch(source: str, journal: str, fn):
    try:
        return fn()
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {exc}")
        return []


def _safe_fetch_with_status(source: str, journal: str, fn):
    try:
        return fn(), True
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {exc}")
        return [], False


def _backfill_window(state_path: Path, lookback_days: int, today: dt.date | None = None):
    today = today or dt.date.today()
    latest_backfill_end = today - dt.timedelta(days=lookback_days + 1)
    end_date = _read_backfill_end_date(state_path) or latest_backfill_end
    if end_date > latest_backfill_end:
        end_date = latest_backfill_end
    start_date = end_date - dt.timedelta(days=BACKFILL_WINDOW_DAYS - 1)
    return start_date, end_date


def _read_backfill_end_date(state_path: Path) -> dt.date | None:
    if not state_path.exists():
        return None
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        value = payload.get("next_end_date")
        return dt.date.fromisoformat(value) if value else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def _save_backfill_state(state_path: Path, start_date: dt.date, end_date: dt.date) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "next_end_date": (start_date - dt.timedelta(days=1)).isoformat(),
        "last_window_start": start_date.isoformat(),
        "last_window_end": end_date.isoformat(),
        "window_days": BACKFILL_WINDOW_DAYS,
        "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    state_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _backfill_papers_for_journal(papers, journal):
    if journal.key not in BACKFILL_PRIORITY_SECTION_JOURNALS:
        return papers
    priority_sections = set(journal.priority_sections)
    return [paper for paper in papers if paper.section in priority_sections]


if __name__ == "__main__":
    main()
