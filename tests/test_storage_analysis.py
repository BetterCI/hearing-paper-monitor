import json

from scripts.paper_monitor.storage import connect, export_json, import_json


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
