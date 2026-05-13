import pytest

from scripts.analyze_with_minimax import ANALYSIS_PROMPT_VERSION, parse_json_object, prompt_for_paper, should_analyze, validate_analysis


def test_parse_json_object_handles_markdown_fence():
    value = parse_json_object(
        """```json
        {
          "scientific_question": "What is being tested?",
          "key_highlight": "The study reports a clear effect.",
          "main_limitation": "The abstract does not state sample diversity."
        }
        ```"""
    )

    assert value["key_highlight"] == "The study reports a clear effect."


def test_validate_analysis_requires_all_fields():
    value = validate_analysis(
        {
            "scientific_question": " Question? ",
            "key_highlight": " Main result. ",
            "main_limitation": " Not stated in the abstract. ",
            "research_implication": " Useful implication. ",
        }
    )

    assert value == {
        "scientific_question": "Question?",
        "key_highlight": "Main result.",
        "main_limitation": "Not stated in the abstract.",
        "research_implication": "Useful implication.",
    }

    with pytest.raises(ValueError, match="missing research_implication"):
        validate_analysis(
            {
                "scientific_question": "Question?",
                "key_highlight": "Main result.",
                "main_limitation": "Not stated in the abstract.",
            }
        )


def test_should_analyze_skips_any_complete_cached_analysis():
    paper = {
        "title": "Speech perception in noise",
        "abstract": "This abstract is intentionally long enough for the analysis script to consider it. " * 3,
    }
    assert should_analyze(paper, refresh=False)

    from scripts.analyze_with_minimax import abstract_hash

    paper["ai_analysis"] = {
        "scientific_question": "Question",
        "key_highlight": "Highlight",
        "main_limitation": "Limitation",
        "research_implication": "Implication",
        "prompt_version": ANALYSIS_PROMPT_VERSION,
        "abstract_hash": "older-hash",
    }
    assert not should_analyze(paper, refresh=False)

    paper["abstract"] = paper["abstract"] + " A later metadata update appended one more sentence."
    assert not should_analyze(paper, refresh=False)
    assert should_analyze(paper, refresh=True)


def test_should_analyze_refreshes_old_prompt_version():
    paper = {
        "title": "Speech perception in noise",
        "abstract": "This abstract is intentionally long enough for the analysis script to consider it. " * 3,
        "ai_analysis": {
            "scientific_question": "Question",
            "key_highlight": "Highlight",
            "main_limitation": "Limitation",
            "research_implication": "Implication",
        },
    }

    assert should_analyze(paper, refresh=False)


def test_should_not_refresh_previous_methodology_prompt_version():
    paper = {
        "title": "Speech perception in noise",
        "abstract": "This abstract is intentionally long enough for the analysis script to consider it. " * 3,
        "ai_analysis": {
            "scientific_question": "Question",
            "key_highlight": "Highlight",
            "main_limitation": "Limitation",
            "methodology_steps": "Recruit listeners; Measure thresholds; Compare groups",
            "research_implication": "Implication",
            "prompt_version": "2026-05-11-methodology-flow-v2",
        },
    }

    assert not should_analyze(paper, refresh=False)


def test_prompt_does_not_request_methodology_flow():
    prompt = prompt_for_paper(
        {
            "title": "Speech perception in noise",
            "journal": "Ear and Hearing",
            "abstract": "Participants completed a speech-in-noise task while EEG was recorded. Responses were compared across groups.",
        },
        "en",
    )

    assert "methodology_steps" not in prompt
    assert "ordered workflow" not in prompt
    assert "research_implication" in prompt
