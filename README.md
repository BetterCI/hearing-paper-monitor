# Hearing Science Paper Monitor

A small web-based monitoring dashboard for new papers in hearing science, psychoacoustics, and related clinical audiology journals.

## Target Journals

- The Journal of the Acoustical Society of America (JASA)
- JASA Express Letters
- Trends in Hearing
- Journal of the Association for Research in Otolaryngology (JARO)
- Ear and Hearing
- Hearing Research

For JASA and JASA Express Letters, the classifier highlights articles in or related to:

- Psychological and Physiological Acoustics
- Speech Communication

## What It Does

- Collects paper metadata from Crossref, PubMed, RSS feeds, and lightweight journal TOC pages when configured.
- Stores title, authors, journal, publication date, DOI, URL, abstract, section, and keywords.
- Deduplicates by DOI, with a title/date fallback for records without a DOI.
- Classifies papers into rule-based tags:
  - cochlear implant
  - hearing aid
  - psychoacoustics
  - speech perception
  - auditory physiology
  - clinical audiology
  - machine learning
  - real-world listening
- Exports a static JSON file at `data/papers.json`.
- Renders a searchable, filterable static web dashboard.
- Never downloads or stores PDFs.
- Links only to official publisher pages, PubMed pages, or DOI pages.

## Quick Start

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/collect.py --days 60
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Useful Commands

```powershell
# Refresh metadata
python scripts/collect.py --days 30

# Rebuild the static frontend data only
python scripts/export_static.py

# Run tests
python -m pytest
```

## Configuration

Journal sources and matching rules live in `config/journals.yml`.

The first version uses Crossref and PubMed as the most robust sources. RSS and TOC fetching are supported by the collector, but publisher feed and page URLs are intentionally configurable because journals change those endpoints more often than Crossref/PubMed APIs.

## GitHub Pages

The workflow in `.github/workflows/update-papers.yml` runs daily, commits refreshed `data/papers.json`, and can publish the static dashboard through GitHub Pages if Pages is enabled for the repository.
