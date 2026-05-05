from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Paper, normalize_doi


SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    journal TEXT NOT NULL,
    publication_date TEXT NOT NULL,
    doi TEXT,
    url TEXT NOT NULL,
    abstract TEXT,
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


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    return conn


def upsert_papers(conn: sqlite3.Connection, papers: list[Paper]) -> int:
    changed = 0
    for paper in papers:
        doi = normalize_doi(paper.doi)
        paper.doi = doi
        conn.execute(
            """
            INSERT INTO papers (
                id, title, authors, journal, publication_date, doi, url, abstract,
                section, keywords, tags, source, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                authors=excluded.authors,
                journal=excluded.journal,
                publication_date=excluded.publication_date,
                doi=excluded.doi,
                url=excluded.url,
                abstract=COALESCE(excluded.abstract, papers.abstract),
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
                paper.journal,
                paper.publication_date,
                doi,
                paper.url,
                paper.abstract,
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
        SELECT title, authors, journal, publication_date, doi, url, abstract,
               section, keywords, tags, source
        FROM papers
        ORDER BY publication_date DESC, title ASC
        """
    ).fetchall()
    columns = [
        "title",
        "authors",
        "journal",
        "publication_date",
        "doi",
        "url",
        "abstract",
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
