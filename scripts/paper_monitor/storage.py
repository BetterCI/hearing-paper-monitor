from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Paper, normalize_doi, normalize_journal_name, normalize_title


SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    title_zh TEXT,
    authors TEXT NOT NULL,
    journal TEXT NOT NULL,
    publication_date TEXT NOT NULL,
    doi TEXT,
    url TEXT NOT NULL,
    full_text_url TEXT,
    abstract TEXT,
    abstract_zh TEXT,
    ai_analysis TEXT,
    first_author_affiliation TEXT,
    last_author_affiliation TEXT,
    last_author_lab_url TEXT,
    last_author_lab_name TEXT,
    last_author_lab_source TEXT,
    publication_stage TEXT,
    key_image_url TEXT,
    key_image_alt TEXT,
    key_formula TEXT,
    section TEXT,
    keywords TEXT NOT NULL,
    tags TEXT NOT NULL,
    source TEXT NOT NULL,
    available_online_date TEXT,
    source_group TEXT,
    source_group_label TEXT,
    actual_journal TEXT,
    match_level TEXT,
    matched_keywords TEXT,
    match_fields TEXT,
    needs_review INTEGER,
    first_seen_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_papers_date ON papers(publication_date);
CREATE INDEX IF NOT EXISTS idx_papers_journal ON papers(journal);
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
"""

MIGRATIONS = [
    "ALTER TABLE papers ADD COLUMN title_zh TEXT",
    "ALTER TABLE papers ADD COLUMN abstract_zh TEXT",
    "ALTER TABLE papers ADD COLUMN ai_analysis TEXT",
    "ALTER TABLE papers ADD COLUMN first_author_affiliation TEXT",
    "ALTER TABLE papers ADD COLUMN last_author_affiliation TEXT",
    "ALTER TABLE papers ADD COLUMN last_author_lab_url TEXT",
    "ALTER TABLE papers ADD COLUMN last_author_lab_name TEXT",
    "ALTER TABLE papers ADD COLUMN last_author_lab_source TEXT",
    "ALTER TABLE papers ADD COLUMN full_text_url TEXT",
    "ALTER TABLE papers ADD COLUMN publication_stage TEXT",
    "ALTER TABLE papers ADD COLUMN key_image_url TEXT",
    "ALTER TABLE papers ADD COLUMN key_image_alt TEXT",
    "ALTER TABLE papers ADD COLUMN key_formula TEXT",
    "ALTER TABLE papers ADD COLUMN available_online_date TEXT",
    "ALTER TABLE papers ADD COLUMN source_group TEXT",
    "ALTER TABLE papers ADD COLUMN source_group_label TEXT",
    "ALTER TABLE papers ADD COLUMN actual_journal TEXT",
    "ALTER TABLE papers ADD COLUMN match_level TEXT",
    "ALTER TABLE papers ADD COLUMN matched_keywords TEXT",
    "ALTER TABLE papers ADD COLUMN match_fields TEXT",
    "ALTER TABLE papers ADD COLUMN needs_review INTEGER",
    "ALTER TABLE papers ADD COLUMN first_seen_at TEXT",
]


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    _migrate(conn)
    _normalize_existing_journals(conn)
    return conn


def import_json(conn: sqlite3.Connection, input_path: Path) -> int:
    if not input_path.exists():
        return 0
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    imported = 0
    for item in payload.get("papers", []):
        doi = normalize_doi(item.get("doi"))
        identity = f"doi:{doi}" if doi else _fallback_identity(item)
        conn.execute(
            """
            INSERT INTO papers (
                id, title, title_zh, authors, journal, publication_date, doi, url, full_text_url,
                abstract, abstract_zh, ai_analysis, first_author_affiliation,
                last_author_affiliation, last_author_lab_url, last_author_lab_name, last_author_lab_source, publication_stage,
                key_image_url, key_image_alt, key_formula, section, keywords, tags, source, available_online_date,
                source_group, source_group_label, actual_journal, match_level, matched_keywords, match_fields, needs_review,
                first_seen_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                title_zh=COALESCE(papers.title_zh, excluded.title_zh),
                abstract_zh=COALESCE(papers.abstract_zh, excluded.abstract_zh),
                ai_analysis=COALESCE(excluded.ai_analysis, papers.ai_analysis),
                first_author_affiliation=COALESCE(papers.first_author_affiliation, excluded.first_author_affiliation),
                last_author_affiliation=COALESCE(excluded.last_author_affiliation, papers.last_author_affiliation),
                last_author_lab_url=COALESCE(papers.last_author_lab_url, excluded.last_author_lab_url),
                last_author_lab_name=COALESCE(papers.last_author_lab_name, excluded.last_author_lab_name),
                last_author_lab_source=COALESCE(papers.last_author_lab_source, excluded.last_author_lab_source),
                publication_stage=COALESCE(excluded.publication_stage, papers.publication_stage),
                full_text_url=COALESCE(papers.full_text_url, excluded.full_text_url),
                key_image_url=COALESCE(papers.key_image_url, excluded.key_image_url),
                key_image_alt=COALESCE(papers.key_image_alt, excluded.key_image_alt),
                key_formula=COALESCE(papers.key_formula, excluded.key_formula),
                available_online_date=COALESCE(excluded.available_online_date, papers.available_online_date),
                source_group=COALESCE(excluded.source_group, papers.source_group),
                source_group_label=COALESCE(excluded.source_group_label, papers.source_group_label),
                actual_journal=COALESCE(excluded.actual_journal, papers.actual_journal),
                match_level=COALESCE(excluded.match_level, papers.match_level),
                matched_keywords=COALESCE(excluded.matched_keywords, papers.matched_keywords),
                match_fields=COALESCE(excluded.match_fields, papers.match_fields),
                needs_review=COALESCE(excluded.needs_review, papers.needs_review),
                first_seen_at=COALESCE(papers.first_seen_at, excluded.first_seen_at),
                updated_at=CURRENT_TIMESTAMP
            """,
            (
                identity,
                item.get("title") or "",
                item.get("title_zh") or item.get("chinese_title"),
                json.dumps(item.get("authors") or [], ensure_ascii=False),
                normalize_journal_name(item.get("journal")),
                item.get("publication_date") or "",
                doi,
                item.get("url") or (f"https://doi.org/{doi}" if doi else ""),
                item.get("full_text_url") or item.get("fullTextUrl") or item.get("html_url"),
                item.get("abstract"),
                item.get("abstract_zh") or item.get("chinese_abstract"),
                _json_or_none(item.get("ai_analysis")),
                item.get("first_author_affiliation"),
                item.get("last_author_affiliation"),
                item.get("last_author_lab_url"),
                item.get("last_author_lab_name"),
                item.get("last_author_lab_source"),
                item.get("publication_stage") or ("early_access" if item.get("is_early_access") else None),
                item.get("key_image_url"),
                item.get("key_image_alt"),
                item.get("key_formula"),
                item.get("section"),
                json.dumps(item.get("keywords") or [], ensure_ascii=False),
                json.dumps(item.get("tags") or [], ensure_ascii=False),
                item.get("source") or "json",
                item.get("available_online_date"),
                item.get("source_group"),
                item.get("source_group_label"),
                item.get("actual_journal"),
                item.get("match_level"),
                json.dumps(item.get("matched_keywords") or [], ensure_ascii=False),
                json.dumps(item.get("match_fields") or [], ensure_ascii=False),
                _bool_or_none(item.get("needs_review")),
                item.get("first_seen_at"),
            ),
        )
        imported += 1
    conn.commit()
    return imported


def upsert_papers(conn: sqlite3.Connection, papers: list[Paper]) -> int:
    changed = 0
    for paper in papers:
        if paper.source_group == "high_impact" and _has_existing_non_high_impact_duplicate(conn, paper):
            continue
        doi = normalize_doi(paper.doi)
        paper.doi = doi
        conn.execute(
            """
            INSERT INTO papers (
                id, title, authors, journal, publication_date, doi, url, abstract,
                first_author_affiliation, last_author_affiliation, last_author_lab_url, last_author_lab_name,
                last_author_lab_source, publication_stage, section, keywords, tags, source, available_online_date,
                source_group, source_group_label, actual_journal, match_level, matched_keywords, match_fields, needs_review,
                first_seen_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                authors=excluded.authors,
                journal=excluded.journal,
                publication_date=excluded.publication_date,
                doi=excluded.doi,
                url=excluded.url,
                abstract=COALESCE(excluded.abstract, papers.abstract),
                title_zh=papers.title_zh,
                abstract_zh=papers.abstract_zh,
                ai_analysis=papers.ai_analysis,
                first_author_affiliation=COALESCE(excluded.first_author_affiliation, papers.first_author_affiliation),
                last_author_affiliation=COALESCE(excluded.last_author_affiliation, papers.last_author_affiliation),
                last_author_lab_url=COALESCE(papers.last_author_lab_url, excluded.last_author_lab_url),
                last_author_lab_name=COALESCE(papers.last_author_lab_name, excluded.last_author_lab_name),
                last_author_lab_source=COALESCE(papers.last_author_lab_source, excluded.last_author_lab_source),
                publication_stage=excluded.publication_stage,
                full_text_url=papers.full_text_url,
                key_image_url=papers.key_image_url,
                key_image_alt=papers.key_image_alt,
                key_formula=papers.key_formula,
                section=COALESCE(excluded.section, papers.section),
                keywords=excluded.keywords,
                tags=excluded.tags,
                source=excluded.source,
                available_online_date=excluded.available_online_date,
                source_group=COALESCE(excluded.source_group, papers.source_group),
                source_group_label=COALESCE(excluded.source_group_label, papers.source_group_label),
                actual_journal=COALESCE(excluded.actual_journal, papers.actual_journal),
                match_level=COALESCE(excluded.match_level, papers.match_level),
                matched_keywords=COALESCE(excluded.matched_keywords, papers.matched_keywords),
                match_fields=COALESCE(excluded.match_fields, papers.match_fields),
                needs_review=COALESCE(excluded.needs_review, papers.needs_review),
                first_seen_at=papers.first_seen_at,
                updated_at=CURRENT_TIMESTAMP
            """,
            (
                paper.identity,
                paper.title,
                json.dumps(paper.authors, ensure_ascii=False),
                normalize_journal_name(paper.journal),
                paper.publication_date,
                doi,
                paper.url,
                paper.abstract,
                paper.first_author_affiliation,
                paper.last_author_affiliation,
                paper.last_author_lab_url,
                paper.last_author_lab_name,
                paper.last_author_lab_source,
                paper.publication_stage,
                paper.section,
                json.dumps(paper.keywords, ensure_ascii=False),
                json.dumps(paper.tags, ensure_ascii=False),
                paper.source,
                paper.available_online_date,
                paper.source_group,
                paper.source_group_label,
                paper.actual_journal,
                paper.match_level,
                json.dumps(paper.matched_keywords, ensure_ascii=False),
                json.dumps(paper.match_fields, ensure_ascii=False),
                _bool_or_none(paper.needs_review),
                _utc_now(),
            ),
        )
        changed += 1
    conn.commit()
    return changed


def all_papers(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT title, title_zh, authors, journal, publication_date, doi, url,
               full_text_url, abstract, abstract_zh, ai_analysis, first_author_affiliation,
               last_author_affiliation, last_author_lab_url, last_author_lab_name, last_author_lab_source,
               publication_stage, key_image_url, key_image_alt, key_formula,
               section, keywords, tags, source, available_online_date,
               source_group, source_group_label, actual_journal, match_level,
               matched_keywords, match_fields, needs_review, first_seen_at
        FROM papers
        ORDER BY publication_date DESC, title ASC
        """
    ).fetchall()
    columns = [
        "title",
        "title_zh",
        "authors",
        "journal",
        "publication_date",
        "doi",
        "url",
        "full_text_url",
        "abstract",
        "abstract_zh",
        "ai_analysis",
        "first_author_affiliation",
        "last_author_affiliation",
        "last_author_lab_url",
        "last_author_lab_name",
        "last_author_lab_source",
        "publication_stage",
        "key_image_url",
        "key_image_alt",
        "key_formula",
        "section",
        "keywords",
        "tags",
        "source",
        "available_online_date",
        "source_group",
        "source_group_label",
        "actual_journal",
        "match_level",
        "matched_keywords",
        "match_fields",
        "needs_review",
        "first_seen_at",
    ]
    papers = []
    for row in rows:
        item = dict(zip(columns, row, strict=True))
        item["authors"] = json.loads(item["authors"])
        item["keywords"] = json.loads(item["keywords"])
        item["tags"] = json.loads(item["tags"])
        item["matched_keywords"] = json.loads(item["matched_keywords"]) if item.get("matched_keywords") else []
        item["match_fields"] = json.loads(item["match_fields"]) if item.get("match_fields") else []
        if item.get("needs_review") is not None:
            item["needs_review"] = bool(item["needs_review"])
        item["ai_analysis"] = json.loads(item["ai_analysis"]) if item.get("ai_analysis") else None
        if not item.get("title_zh"):
            item.pop("title_zh", None)
        if not item.get("abstract_zh"):
            item.pop("abstract_zh", None)
        if not item.get("ai_analysis"):
            item.pop("ai_analysis", None)
        if not item.get("first_author_affiliation"):
            item.pop("first_author_affiliation", None)
        if not item.get("last_author_affiliation"):
            item.pop("last_author_affiliation", None)
        if not item.get("last_author_lab_url"):
            item.pop("last_author_lab_url", None)
        if not item.get("last_author_lab_name"):
            item.pop("last_author_lab_name", None)
        if not item.get("last_author_lab_source"):
            item.pop("last_author_lab_source", None)
        if not item.get("publication_stage"):
            item.pop("publication_stage", None)
        if not item.get("full_text_url"):
            item.pop("full_text_url", None)
        if not item.get("key_image_url"):
            item.pop("key_image_url", None)
        if not item.get("key_image_alt"):
            item.pop("key_image_alt", None)
        if not item.get("key_formula"):
            item.pop("key_formula", None)
        if not item.get("available_online_date"):
            item.pop("available_online_date", None)
        if not item.get("source_group"):
            item.pop("source_group", None)
        if not item.get("source_group_label"):
            item.pop("source_group_label", None)
        if not item.get("actual_journal"):
            item.pop("actual_journal", None)
        if not item.get("match_level"):
            item.pop("match_level", None)
        if not item.get("matched_keywords"):
            item.pop("matched_keywords", None)
        if not item.get("match_fields"):
            item.pop("match_fields", None)
        if item.get("needs_review") is None:
            item.pop("needs_review", None)
        if not item.get("first_seen_at"):
            item.pop("first_seen_at", None)
        papers.append(item)
    return papers


def earliest_publication_date(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        """
        SELECT MIN(publication_date)
        FROM papers
        WHERE publication_date GLOB '????-??-??'
        """
    ).fetchone()
    return row[0] if row and row[0] else None


def export_json(conn: sqlite3.Connection, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": _utc_now(),
        "papers": all_papers(conn),
    }
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _migrate(conn: sqlite3.Connection) -> None:
    for statement in MIGRATIONS:
        try:
            conn.execute(statement)
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
    conn.commit()


def _normalize_existing_journals(conn: sqlite3.Connection) -> None:
    conn.execute("UPDATE papers SET journal = ? WHERE journal = ?", ("Ear and Hearing", "Ear & Hearing"))
    conn.commit()


def _fallback_identity(item: dict) -> str:
    title = " ".join((item.get("title") or "").lower().split())
    journal = normalize_journal_name(item.get("journal")).lower()
    return f"title:{title}|date:{item.get('publication_date') or ''}|journal:{journal}"


def _json_or_none(value) -> str | None:
    return json.dumps(value, ensure_ascii=False) if value else None


def _bool_or_none(value) -> int | None:
    if value is None:
        return None
    return 1 if bool(value) else 0


def _has_existing_non_high_impact_duplicate(conn: sqlite3.Connection, paper: Paper) -> bool:
    doi = normalize_doi(paper.doi)
    if doi:
        row = conn.execute("SELECT journal FROM papers WHERE doi = ?", (doi,)).fetchone()
        return bool(row and row[0] != "High-impact Journals")

    target_title = normalize_title(paper.title)
    if not target_title:
        return False
    rows = conn.execute("SELECT title, journal FROM papers").fetchall()
    return any(normalize_title(title) == target_title and journal != "High-impact Journals" for title, journal in rows)
