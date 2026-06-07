from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class Journal:
    key: str
    name: str
    aliases: list[str]
    issn: list[str]
    priority_sections: list[str] = field(default_factory=list)
    crossref: bool = True
    pubmed: bool = True
    rss: list[str] = field(default_factory=list)
    toc: list[str] = field(default_factory=list)
    lookback_days: int | None = None


@dataclass(frozen=True)
class MonitorConfig:
    journals: list[Journal]
    tags: dict[str, list[str]]
    section_rules: dict[str, list[str]]
    high_impact_journals: list[str] = field(default_factory=list)
    topic_filtered_journals: list[Journal] = field(default_factory=list)
    arxiv_preprints: dict[str, Any] = field(default_factory=dict)


def load_config(path: Path) -> MonitorConfig:
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    journals = [Journal(**item) for item in raw.get("journals", [])]
    topic_filtered_journals = [Journal(**item) for item in raw.get("topic_filtered_journals", [])]
    return MonitorConfig(
        journals=journals,
        tags=raw.get("tags", {}),
        section_rules=raw.get("section_rules", {}),
        high_impact_journals=raw.get("high_impact_journals", []),
        topic_filtered_journals=topic_filtered_journals,
        arxiv_preprints=raw.get("arxiv_preprints", {}),
    )
