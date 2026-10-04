from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from paper_monitor.classifier import classify
from paper_monitor.config import load_config
from paper_monitor.sources import (
    SourceFetchError,
    dedupe_high_impact_papers,
    dedupe_topic_filtered_papers,
    fetch_arxiv_preprints,
    fetch_arxiv_preprints_between,
    fetch_crossref,
    fetch_crossref_between,
    fetch_high_impact_crossref,
    fetch_high_impact_crossref_between,
    fetch_high_impact_pubmed,
    fetch_high_impact_pubmed_between,
    fetch_pubmed,
    fetch_pubmed_between,
    fetch_rss,
    fetch_topic_filtered_crossref,
    fetch_topic_filtered_crossref_between,
    fetch_topic_filtered_pubmed,
    fetch_topic_filtered_pubmed_between,
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
    parser.add_argument(
        "--journal-days",
        type=int,
        default=None,
        help="Lookback window for core key journals; defaults to --days.",
    )
    parser.add_argument(
        "--max-journal-lookback-days",
        type=int,
        default=None,
        help="Cap per-journal lookback overrides during lightweight runs.",
    )
    parser.add_argument("--skip-backfill", action="store_true", help="Skip the historical backfill window.")
    parser.add_argument(
        "--skip-high-impact-crossref",
        action="store_true",
        help="Use the batched PubMed query only for high-impact journals.",
    )
    parser.add_argument("--source-status", type=Path, default=ROOT / "data/source_status.json")
    parser.add_argument("--core-only", action="store_true", help="Refresh only the existing six core journals.")
    args = parser.parse_args()

    config = load_config(args.config)
    conn = connect(args.db)
    imported = import_json(conn, args.output)
    if imported:
        print(f"Imported {imported} existing JSON records before refresh")
    total = 0
    previous_status = _read_source_status(args.source_status)
    status_entries = []

    for journal in config.journals:
        days = _journal_lookback_days(journal, args.days, args.max_journal_lookback_days, args.journal_days)
        existing_keys = {row[0] for row in conn.execute("SELECT id FROM papers")}
        fetches = []
        for name, enabled, fn in [
            ("Crossref", journal.crossref, lambda: fetch_crossref(journal, days)),
            ("PubMed", journal.pubmed, lambda: fetch_pubmed(journal, days)),
            ("RSS", bool(journal.rss), lambda: fetch_rss(journal)),
            ("TOC", bool(journal.toc), lambda: fetch_toc(journal)),
        ]:
            if enabled:
                result, ok = _safe_fetch_with_status(name, journal.name, fn)
                fetches.append((name, result, ok))
        papers = [classify(paper, journal, config) for paper in merge_dedupe([result for _, result, _ in fetches]) if paper.title]
        changed = upsert_papers(conn, papers)
        total += changed
        added = sum(paper.identity not in existing_keys for paper in papers)
        status_entries.append(_journal_source_status(journal, days, fetches, papers, added, previous_status.get(journal.key, {})))
        _write_source_status(args.source_status, status_entries)
        print(f"{journal.name}: {changed} processed, {added} newly added; {status_entries[-1]['state']}")

    if config.high_impact_journals and not args.core_only:
        groups = []
        if not args.skip_high_impact_crossref:
            groups.append(
                _safe_fetch("Crossref", "High-impact Journals", lambda: fetch_high_impact_crossref(config, args.days))
            )
        groups.append(_safe_fetch("PubMed", "High-impact Journals", lambda: fetch_high_impact_pubmed(config, args.days)))
        papers = dedupe_high_impact_papers([paper for paper in merge_dedupe(groups) if paper.title])
        changed = upsert_papers(conn, papers)
        total += changed
        print(f"High-impact Journals: {changed} records")

    if config.topic_filtered_journals and not args.core_only:
        groups = [
            _safe_fetch("Crossref", "Topic-filtered Journals", lambda: fetch_topic_filtered_crossref(config, args.days)),
            _safe_fetch("PubMed", "Topic-filtered Journals", lambda: fetch_topic_filtered_pubmed(config, args.days)),
        ]
        papers = dedupe_topic_filtered_papers([paper for paper in merge_dedupe(groups) if paper.title])
        changed = upsert_papers(conn, papers)
        total += changed
        print(f"Topic-filtered Journals: {changed} records")

    if config.arxiv_preprints.get("enabled", False) and not args.core_only:
        papers = _safe_fetch("arXiv", "Preprints", lambda: fetch_arxiv_preprints(config, args.days))
        changed = upsert_papers(conn, papers)
        total += changed
        print(f"Preprints (arXiv): {changed} records")

    backfill_window = None if args.skip_backfill else _backfill_window(args.backfill_state, args.days)
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

        if config.high_impact_journals and not args.core_only:
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

        if config.topic_filtered_journals and not args.core_only:
            fetches = [
                _safe_fetch_with_status("Crossref backfill", "Topic-filtered Journals", lambda: fetch_topic_filtered_crossref_between(config, start_date, end_date)),
                _safe_fetch_with_status("PubMed backfill", "Topic-filtered Journals", lambda: fetch_topic_filtered_pubmed_between(config, start_date, end_date)),
            ]
            backfill_complete = backfill_complete and all(ok for _, ok in fetches)
            groups = [papers for papers, _ in fetches]
            papers = dedupe_topic_filtered_papers([paper for paper in merge_dedupe(groups) if paper.title])
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"Topic-filtered Journals backfill: {changed} records")

        if config.arxiv_preprints.get("enabled", False) and not args.core_only:
            fetches = [
                _safe_fetch_with_status("arXiv backfill", "Preprints", lambda: fetch_arxiv_preprints_between(config, start_date, end_date)),
            ]
            backfill_complete = backfill_complete and all(ok for _, ok in fetches)
            papers = [paper for papers, _ in fetches for paper in papers]
            changed = upsert_papers(conn, papers)
            total += changed
            print(f"Preprints (arXiv) backfill: {changed} records")

        if backfill_complete:
            _save_backfill_state(args.backfill_state, start_date, end_date)
        else:
            print("Backfill state not advanced because one or more backfill fetches failed")

    _write_source_status(args.source_status, status_entries)
    export_json(conn, args.output)
    print(f"Exported {args.output} after processing {total} records")


def _safe_fetch(source: str, journal: str, fn):
    try:
        return fn()
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {type(exc).__name__}")
        return getattr(exc, "papers", [])


def _safe_fetch_with_status(source: str, journal: str, fn):
    try:
        return fn(), True
    except Exception as exc:
        print(f"Warning: {source} fetch failed for {journal}: {type(exc).__name__}")
        return getattr(exc, "papers", []), False


def _read_source_status(path):
    try:
        return {entry["key"]: entry for entry in json.loads(path.read_text(encoding="utf-8")).get("journals", [])}
    except (OSError, ValueError, TypeError, KeyError):
        return {}


def _journal_source_status(journal, days, fetches, papers, added, previous):
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    successes = sum(ok for _, _, ok in fetches)
    complete = bool(fetches) and successes == len(fetches)
    return {"key": journal.key, "journal": journal.name, "checked_at": now,
            "last_success_at": now if complete else previous.get("last_success_at"),
            "state": "ok" if complete else "partial" if successes else "failed",
            "lookback_days": days, "newly_added": added, "fetched": len(papers),
            "latest_publication_date": max((p.publication_date or "" for p in papers), default=None),
            "sources": [{"name": name, "state": "ok" if ok else "failed", "records": len(result)}
                        for name, result, ok in fetches]}


def _write_source_status(path, entries):
    path.parent.mkdir(parents=True, exist_ok=True)
    checked = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    path.write_text(json.dumps({"checked_at": checked, "journals": entries}, indent=2) + "\n", encoding="utf-8")


def _backfill_window(state_path: Path, lookback_days: int, today: dt.date | None = None):
    today = today or dt.date.today()
    latest_backfill_end = today - dt.timedelta(days=lookback_days + 1)
    end_date = _read_backfill_end_date(state_path) or latest_backfill_end
    if end_date > latest_backfill_end:
        end_date = latest_backfill_end
    start_date = end_date - dt.timedelta(days=BACKFILL_WINDOW_DAYS - 1)
    return start_date, end_date


def _journal_lookback_days(
    journal,
    default_days: int,
    max_days: int | None = None,
    journal_days: int | None = None,
) -> int:
    base_days = journal_days or default_days
    days = max(base_days, journal.lookback_days or base_days)
    if max_days is not None:
        days = min(days, max(default_days, max_days))
    return days


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
