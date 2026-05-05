from pathlib import Path

from scripts.paper_monitor.classifier import classify
from scripts.paper_monitor.config import load_config
from scripts.paper_monitor.models import Paper


def test_classifies_speech_and_priority_section():
    config = load_config(Path("config/journals.yml"))
    journal = next(item for item in config.journals if item.key == "jasa")
    paper = Paper(
        title="Speech perception in noise and listening effort",
        authors=[],
        journal=journal.name,
        publication_date="2026-01-01",
        doi="10.1121/example",
        url="https://doi.org/10.1121/example",
        abstract="A psychoacoustic study of speech intelligibility.",
    )

    classified = classify(paper, journal, config)

    assert "speech perception" in classified.tags
    assert "psychoacoustics" in classified.tags
    assert classified.section == "Psychological and Physiological Acoustics"
    assert "priority section" in classified.tags
