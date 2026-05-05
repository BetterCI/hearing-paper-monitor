from __future__ import annotations

from .config import Journal, MonitorConfig
from .models import Paper


def classify(paper: Paper, journal: Journal, config: MonitorConfig) -> Paper:
    text = " ".join(
        part
        for part in [
            paper.title,
            paper.abstract or "",
            " ".join(paper.keywords),
            paper.section or "",
        ]
        if part
    ).lower()

    tags = {
        tag
        for tag, terms in config.tags.items()
        if any(term.lower() in text for term in terms)
    }
    paper.tags = sorted(tags)

    if not paper.section:
        for section, terms in config.section_rules.items():
            if any(term.lower() in text for term in terms):
                paper.section = section
                break

    if paper.section in journal.priority_sections and "priority section" not in paper.tags:
        paper.tags.append("priority section")
        paper.tags.sort()

    return paper
