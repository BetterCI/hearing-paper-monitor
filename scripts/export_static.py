from __future__ import annotations

from pathlib import Path

from paper_monitor.storage import connect, export_json

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    conn = connect(ROOT / "papers.sqlite")
    export_json(conn, ROOT / "data" / "papers.json")
    print("Exported data/papers.json")


if __name__ == "__main__":
    main()
