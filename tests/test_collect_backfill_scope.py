import sys
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))

from collect import _backfill_papers_for_journal
from paper_monitor.config import Journal
from paper_monitor.models import Paper


def _paper(title: str, section: str | None) -> Paper:
    return Paper(
        title=title,
        authors=[],
        journal="Test Journal",
        publication_date="2026-01-01",
        doi=None,
        url="https://example.com",
        section=section,
    )


def test_jasa_backfill_keeps_only_priority_sections():
    journal = Journal(
        key="jasa",
        name="The Journal of the Acoustical Society of America",
        aliases=[],
        issn=[],
        priority_sections=["Psychological and Physiological Acoustics", "Speech Communication"],
    )
    papers = [
        _paper("P and P paper", "Psychological and Physiological Acoustics"),
        _paper("Speech paper", "Speech Communication"),
        _paper("Other section paper", "Structural Acoustics and Vibration"),
        _paper("Unsectioned paper", None),
    ]

    scoped = _backfill_papers_for_journal(papers, journal)

    assert [paper.title for paper in scoped] == ["P and P paper", "Speech paper"]


def test_backfill_keeps_all_non_jasa_core_journal_papers():
    journal = Journal(
        key="hearing-research",
        name="Hearing Research",
        aliases=[],
        issn=[],
    )
    papers = [
        _paper("Hearing research paper", None),
        _paper("Another hearing research paper", "Original Article"),
    ]

    assert _backfill_papers_for_journal(papers, journal) == papers
