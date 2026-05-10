from scripts.enrich_labs import (
    SearchResult,
    institution_hint,
    last_author_name,
    plausible_lab_result,
    search_queries,
)


def test_last_author_name_uses_final_listed_author():
    paper = {"authors": ["First Author", "Senior Scientist"]}

    assert last_author_name(paper) == "Senior Scientist"


def test_lab_search_query_uses_institution_hint():
    queries = search_queries("Senior Scientist", "Department of Otolaryngology, Example University, City")

    assert queries[0] == '"Senior Scientist" "Example University" lab'


def test_plausible_lab_result_rejects_publisher_pages():
    result = SearchResult(
        title="Senior Scientist - Auditory Neuroscience Lab",
        url="https://www.nature.com/articles/example",
        snippet="Example University",
    )

    assert not plausible_lab_result(result, "Senior Scientist", "Example University")


def test_plausible_lab_result_accepts_academic_lab_page():
    result = SearchResult(
        title="Senior Scientist Auditory Lab",
        url="https://hearing.example.edu/people/senior-scientist",
        snippet="Example University hearing laboratory",
    )

    assert plausible_lab_result(result, "Senior Scientist", "Example University")


def test_institution_hint_prefers_named_institution():
    assert institution_hint("Department of Neuroscience, Example Institute, City") == "Example Institute"
