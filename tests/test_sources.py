from scripts.paper_monitor.sources import _crossref_publication_stage


def test_crossref_online_first_without_issue_assignment_is_early_access():
    item = {
        "title": ["A hearing science paper"],
        "published-online": {"date-parts": [[2026, 5, 1]]},
    }

    assert _crossref_publication_stage(item, "Ear and Hearing", "2026-05-01") == "early_access"


def test_online_only_journal_is_not_early_access_by_default():
    item = {
        "title": ["A trends in hearing paper"],
        "published-online": {"date-parts": [[2026, 5, 1]]},
    }

    assert _crossref_publication_stage(item, "Trends in Hearing", "2026-05-01") is None


def test_future_publication_date_is_early_access():
    item = {"title": ["An article in press"]}

    assert _crossref_publication_stage(item, "Hearing Research", "2999-01-01") == "early_access"
