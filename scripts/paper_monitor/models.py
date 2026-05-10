from __future__ import annotations

from dataclasses import asdict, dataclass, field

JOURNAL_NAME_ALIASES = {
    "Ear & Hearing": "Ear and Hearing",
}


@dataclass
class Paper:
    title: str
    authors: list[str]
    journal: str
    publication_date: str
    doi: str | None
    url: str
    abstract: str | None = None
    first_author_affiliation: str | None = None
    publication_stage: str | None = None
    section: str | None = None
    keywords: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    source: str = "unknown"
    available_online_date: str | None = None
    source_group: str | None = None
    source_group_label: str | None = None
    actual_journal: str | None = None
    match_level: str | None = None
    matched_keywords: list[str] = field(default_factory=list)
    match_fields: list[str] = field(default_factory=list)
    needs_review: bool | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def identity(self) -> str:
        if self.doi:
            return f"doi:{normalize_doi(self.doi)}"
        lowered = " ".join(self.title.lower().split())
        return f"title:{lowered}|date:{self.publication_date}|journal:{self.journal.lower()}"

    @property
    def normalized_title(self) -> str:
        return normalize_title(self.title)


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    value = doi.strip().lower()
    value = value.removeprefix("https://doi.org/")
    value = value.removeprefix("http://doi.org/")
    value = value.removeprefix("doi:")
    return value.strip()


def normalize_journal_name(journal: str | None) -> str:
    value = " ".join((journal or "").split())
    return JOURNAL_NAME_ALIASES.get(value, value)


def normalize_title(title: str | None) -> str:
    return " ".join((title or "").lower().split())
