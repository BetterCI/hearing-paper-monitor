import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path("scripts").resolve()))

from collect import _backfill_papers_for_journal, _backfill_window, _journal_lookback_days, _save_backfill_state
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


def test_backfill_window_starts_before_regular_lookback_when_state_is_missing(tmp_path):
    state_path = tmp_path / "backfill_state.json"

    start_date, end_date = _backfill_window(state_path, lookback_days=45, today=dt.date(2026, 5, 18))

    assert start_date == dt.date(2026, 3, 27)
    assert end_date == dt.date(2026, 4, 2)


def test_backfill_window_uses_saved_cutoff_instead_of_earliest_paper(tmp_path):
    state_path = tmp_path / "backfill_state.json"
    _save_backfill_state(state_path, dt.date(2026, 3, 27), dt.date(2026, 4, 2))

    start_date, end_date = _backfill_window(state_path, lookback_days=45, today=dt.date(2026, 5, 18))

    assert start_date == dt.date(2026, 3, 20)
    assert end_date == dt.date(2026, 3, 26)


def test_daily_run_can_cap_a_journal_lookback_override():
    journal = Journal(
        key="trends-hearing",
        name="Trends in Hearing",
        aliases=[],
        issn=[],
        lookback_days=180,
    )

    assert _journal_lookback_days(journal, default_days=14, max_days=30) == 30
    assert _journal_lookback_days(journal, default_days=14) == 180
