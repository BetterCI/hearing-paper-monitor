import json

from scripts.paper_monitor.storage import connect, earliest_publication_date, export_json, import_json, upsert_papers
from scripts.paper_monitor.models import Paper


def test_storage_preserves_ai_analysis(tmp_path):
    input_path = tmp_path / "papers.json"
    output_path = tmp_path / "exported.json"
    input_path.write_text(
        json.dumps(
            {
                "papers": [
                    {
                        "title": "Speech perception in noise",
                        "authors": ["A. Author"],
                        "journal": "Ear and Hearing",
                        "publication_date": "2026-05-01",
                        "doi": "10.1234/example",
                        "url": "https://doi.org/10.1234/example",
                        "abstract": "A long enough abstract for storage testing.",
                        "keywords": [],
                        "tags": ["speech perception"],
                        "source": "test",
                        "last_author_affiliation": "Example Hearing Lab, Example University",
                        "last_author_lab_url": "https://example.edu/hearing-lab",
                        "last_author_lab_name": "Example Hearing Lab",
                        "last_author_lab_source": "web_search",
                        "ai_analysis": {
                            "scientific_question": "Question",
                            "key_highlight": "Highlight",
                            "main_limitation": "Limitation",
                        },
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    conn = connect(tmp_path / "papers.sqlite")
    assert import_json(conn, input_path) == 1
    export_json(conn, output_path)

    exported = json.loads(output_path.read_text(encoding="utf-8"))
    assert exported["papers"][0]["ai_analysis"]["key_highlight"] == "Highlight"
    assert exported["papers"][0]["last_author_lab_url"] == "https://example.edu/hearing-lab"


def test_earliest_publication_date_uses_existing_records(tmp_path):
    conn = connect(tmp_path / "papers.sqlite")
    upsert_papers(
        conn,
        [
            Paper(
                title="Newer paper",
                authors=[],
                journal="Ear and Hearing",
                publication_date="2026-05-01",
                doi="10.1234/newer",
                url="https://doi.org/10.1234/newer",
            ),
            Paper(
                title="Older paper",
                authors=[],
                journal="Hearing Research",
                publication_date="2026-04-20",
                doi="10.1234/older",
                url="https://doi.org/10.1234/older",
            ),
        ],
    )

    assert earliest_publication_date(conn) == "2026-04-20"


def test_new_papers_get_first_seen_at_once(tmp_path):
    output_path = tmp_path / "exported.json"
    conn = connect(tmp_path / "papers.sqlite")

    upsert_papers(
        conn,
        [
            Paper(
                title="Newly tracked paper",
                authors=["A. Author"],
                journal="Ear and Hearing",
                publication_date="2026-05-01",
                doi="10.1234/first-seen",
                url="https://doi.org/10.1234/first-seen",
            )
        ],
    )
    export_json(conn, output_path)
    first_export = json.loads(output_path.read_text(encoding="utf-8"))
    first_seen_at = first_export["papers"][0]["first_seen_at"]

    upsert_papers(
        conn,
        [
            Paper(
                title="Newly tracked paper",
                authors=["A. Author", "B. Author"],
                journal="Ear and Hearing",
                publication_date="2026-05-01",
                doi="10.1234/first-seen",
                url="https://doi.org/10.1234/first-seen",
            )
        ],
    )
    export_json(conn, output_path)
    second_export = json.loads(output_path.read_text(encoding="utf-8"))

    assert first_seen_at.endswith("Z")
    assert second_export["papers"][0]["first_seen_at"] == first_seen_at
