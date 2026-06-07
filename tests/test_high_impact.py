from pathlib import Path

from scripts.paper_monitor.config import load_config
from scripts.paper_monitor.models import Paper
from scripts.paper_monitor.sources import dedupe_high_impact_papers, high_impact_match, topic_filtered_match
from scripts.paper_monitor.storage import all_papers, connect, upsert_papers


def test_existing_six_journal_keys_remain_unchanged():
    config = load_config(Path("config/journals.yml"))

    assert [journal.key for journal in config.journals] == [
        "jasa",
        "jasael",
        "trends-hearing",
        "jaro",
        "ear-hearing",
        "hearing-research",
    ]


def test_topic_filtered_journals_are_separate_from_core_six():
    config = load_config(Path("config/journals.yml"))

    assert [journal.key for journal in config.topic_filtered_journals] == [
        "ieee-taslp",
        "speech-communication",
    ]


def test_arxiv_preprints_are_enabled_with_strict_queries():
    config = load_config(Path("config/journals.yml"))

    assert config.arxiv_preprints["enabled"] is True
    assert "speech recognition" not in config.arxiv_preprints["queries"]
    assert "cochlear implant" in config.arxiv_preprints["queries"]


def test_high_impact_level_1_direct_title_match():
    match = high_impact_match(title="Cochlear implant users in complex listening environments")

    assert match == {
        "match_level": "level_1_direct",
        "matched_keywords": ["cochlear implant", "cochlear implant users"],
        "match_fields": ["title"],
        "needs_review": False,
    }


def test_high_impact_does_not_match_abstract_only_terms():
    match = high_impact_match(
        title="A digital health trial in older adults",
        keywords=[],
        mesh=[],
        subjects=[],
    )

    assert match is None


def test_high_impact_level_3_requires_level_2_context():
    assert high_impact_match(title="Auditory cortex temporal coding in cognition") is None

    match = high_impact_match(title="Auditory cortex responses in tinnitus")

    assert match["match_level"] == "level_3_context_dependent"
    assert match["needs_review"] is True
    assert match["match_fields"] == ["title"]


def test_high_impact_speech_perception_is_level_2():
    match = high_impact_match(
        title="Real-time brain-controlled selective hearing enhances speech perception in multi-talker environments"
    )

    assert match == {
        "match_level": "level_2_hearing_specific",
        "matched_keywords": ["speech perception"],
        "match_fields": ["title"],
        "needs_review": False,
    }


def test_topic_filtered_match_keeps_requested_hearing_and_speech_topics():
    match = topic_filtered_match(title="Speech perception with cochlear implants in noise")

    assert match == {
        "match_level": "topic_filtered_hearing_speech",
        "matched_keywords": ["cochlear implant", "cochlear implants", "speech perception"],
        "match_fields": ["title"],
        "needs_review": False,
    }


def test_topic_filtered_match_rejects_general_asr_paper():
    match = topic_filtered_match(title="A transformer model for automatic speech recognition")

    assert match is None


def test_high_impact_duplicate_doi_keeps_original_journal_entry(tmp_path):
    conn = connect(tmp_path / "papers.sqlite")
    original = Paper(
        title="Speech perception in hearing loss",
        authors=[],
        journal="Ear and Hearing",
        publication_date="2026-01-01",
        doi="10.1234/duplicate",
        url="https://doi.org/10.1234/duplicate",
        source="pubmed",
    )
    high_impact = Paper(
        title="Speech perception in hearing loss",
        authors=[],
        journal="High-impact Journals",
        publication_date="2026-01-02",
        doi="10.1234/duplicate",
        url="https://doi.org/10.1234/duplicate",
        source="crossref",
        source_group="high_impact",
        source_group_label="High-impact Journals",
        actual_journal="Nature",
        match_level="level_2_hearing_specific",
        matched_keywords=["hearing loss"],
        match_fields=["title"],
        needs_review=False,
    )

    assert upsert_papers(conn, [original]) == 1
    assert upsert_papers(conn, [high_impact]) == 0

    papers = all_papers(conn)
    assert len(papers) == 1
    assert papers[0]["journal"] == "Ear and Hearing"


def test_high_impact_missing_doi_dedupes_by_normalized_title():
    first = Paper(
        title="  Hearing Loss in Adults  ",
        authors=[],
        journal="High-impact Journals",
        publication_date="2026-01-01",
        doi=None,
        url="https://example.com/1",
        source_group="high_impact",
    )
    second = Paper(
        title="Hearing loss in adults",
        authors=[],
        journal="High-impact Journals",
        publication_date="2026-01-02",
        doi=None,
        url="https://example.com/2",
        source_group="high_impact",
    )

    assert dedupe_high_impact_papers([first, second]) == [first]
