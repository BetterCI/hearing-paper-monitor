import pytest

from scripts.analyze_with_minimax import parse_json_object, should_analyze, validate_analysis


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
            "methodology_steps": " Step one ; step two ",
            "research_implication": " Useful implication. ",
        }
    )

    assert value == {
        "scientific_question": "Question?",
        "key_highlight": "Main result.",
        "main_limitation": "Not stated in the abstract.",
        "methodology_steps": "Step one ; step two",
        "research_implication": "Useful implication.",
    }

    with pytest.raises(ValueError, match="missing research_implication"):
        validate_analysis(
            {
                "scientific_question": "Question?",
                "key_highlight": "Main result.",
                "main_limitation": "Not stated in the abstract.",
                "methodology_steps": "Step one; step two",
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
        "methodology_steps": "Recruit listeners; Measure thresholds; Compare groups",
        "research_implication": "Implication",
        "abstract_hash": "older-hash",
    }
    assert not should_analyze(paper, refresh=False)

    paper["abstract"] = paper["abstract"] + " A later metadata update appended one more sentence."
    assert not should_analyze(paper, refresh=False)
    assert should_analyze(paper, refresh=True)
