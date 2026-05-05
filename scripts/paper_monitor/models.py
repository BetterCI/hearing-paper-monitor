from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class Paper:
    title: str
    authors: list[str]
    journal: str
    publication_date: str
    doi: str | None
    url: str
    abstract: str | None = None
    section: str | None = None
    keywords: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    source: str = "unknown"

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def identity(self) -> str:
        if self.doi:
            return f"doi:{normalize_doi(self.doi)}"
        lowered = " ".join(self.title.lower().split())
        return f"title:{lowered}|date:{self.publication_date}|journal:{self.journal.lower()}"


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    value = doi.strip().lower()
    value = value.removeprefix("https://doi.org/")
    value = value.removeprefix("http://doi.org/")
    value = value.removeprefix("doi:")
    return value.strip()
