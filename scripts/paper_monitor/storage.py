from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Paper, normalize_doi, normalize_journal_name


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
    first_author_affiliation TEXT,
    publication_stage TEXT,
    key_image_url TEXT,
    key_image_alt TEXT,
    key_formula TEXT,
    section TEXT,
    keywords TEXT NOT NULL,
    tags TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_papers_date ON papers(publication_date);
CREATE INDEX IF NOT EXISTS idx_papers_journal ON papers(journal);
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
"""

MIGRATIONS = [
    "ALTER TABLE papers ADD COLUMN title_zh TEXT",
    "ALTER TABLE papers ADD COLUMN abstract_zh TEXT",
    "ALTER TABLE papers ADD COLUMN first_author_affiliation TEXT",
    "ALTER TABLE papers ADD COLUMN full_text_url TEXT",
    "ALTER TABLE papers ADD COLUMN publication_stage TEXT",
    "ALTER TABLE papers ADD COLUMN key_image_url TEXT",
    "ALTER TABLE papers ADD COLUMN key_image_alt TEXT",
    "ALTER TABLE papers ADD COLUMN key_formula TEXT",
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
                abstract, abstract_zh, first_author_affiliation, publication_stage, key_image_url,
                key_image_alt, key_formula, section, keywords, tags, source, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                title_zh=COALESCE(papers.title_zh, excluded.title_zh),
                abstract_zh=COALESCE(papers.abstract_zh, excluded.abstract_zh),
                first_author_affiliation=COALESCE(papers.first_author_affiliation, excluded.first_author_affiliation),
                publication_stage=COALESCE(excluded.publication_stage, papers.publication_stage),
                full_text_url=COALESCE(papers.full_text_url, excluded.full_text_url),
                key_image_url=COALESCE(papers.key_image_url, excluded.key_image_url),
                key_image_alt=COALESCE(papers.key_image_alt, excluded.key_image_alt),
                key_formula=COALESCE(papers.key_formula, excluded.key_formula),
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
                item.get("first_author_affiliation"),
                item.get("publication_stage") or ("early_access" if item.get("is_early_access") else None),
                item.get("key_image_url"),
                item.get("key_image_alt"),
                item.get("key_formula"),
                item.get("section"),
                json.dumps(item.get("keywords") or [], ensure_ascii=False),
                json.dumps(item.get("tags") or [], ensure_ascii=False),
                item.get("source") or "json",
            ),
        )
        imported += 1
    conn.commit()
    return imported


def upsert_papers(conn: sqlite3.Connection, papers: list[Paper]) -> int:
    changed = 0
    for paper in papers:
        doi = normalize_doi(paper.doi)
        paper.doi = doi
        conn.execute(
            """
            INSERT INTO papers (
                id, title, authors, journal, publication_date, doi, url, abstract,
                first_author_affiliation, publication_stage, section, keywords, tags, source, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                first_author_affiliation=COALESCE(excluded.first_author_affiliation, papers.first_author_affiliation),
                publication_stage=excluded.publication_stage,
                full_text_url=papers.full_text_url,
                key_image_url=papers.key_image_url,
                key_image_alt=papers.key_image_alt,
                key_formula=papers.key_formula,
                section=COALESCE(excluded.section, papers.section),
                keywords=excluded.keywords,
                tags=excluded.tags,
                source=excluded.source,
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
                paper.publication_stage,
                paper.section,
                json.dumps(paper.keywords, ensure_ascii=False),
                json.dumps(paper.tags, ensure_ascii=False),
                paper.source,
            ),
        )
        changed += 1
    conn.commit()
    return changed


def all_papers(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT title, title_zh, authors, journal, publication_date, doi, url,
               full_text_url, abstract, abstract_zh, first_author_affiliation,
               publication_stage, key_image_url, key_image_alt, key_formula,
               section, keywords, tags, source
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
        "first_author_affiliation",
        "publication_stage",
        "key_image_url",
        "key_image_alt",
        "key_formula",
        "section",
        "keywords",
        "tags",
        "source",
    ]
    papers = []
    for row in rows:
        item = dict(zip(columns, row, strict=True))
        item["authors"] = json.loads(item["authors"])
        item["keywords"] = json.loads(item["keywords"])
        item["tags"] = json.loads(item["tags"])
        if not item.get("title_zh"):
            item.pop("title_zh", None)
        if not item.get("abstract_zh"):
            item.pop("abstract_zh", None)
        if not item.get("first_author_affiliation"):
            item.pop("first_author_affiliation", None)
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
        papers.append(item)
    return papers


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
