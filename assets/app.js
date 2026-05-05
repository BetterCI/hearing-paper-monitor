const state = {
  papers: [],
  filters: {
    query: "",
    journal: "",
    section: "",
    tag: "",
    days: "",
  },
};

const els = {
  papers: document.querySelector("#papers"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  journal: document.querySelector("#journalFilter"),
  section: document.querySelector("#sectionFilter"),
  tag: document.querySelector("#tagFilter"),
  date: document.querySelector("#dateFilter"),
  paperCount: document.querySelector("#paperCount"),
  generatedAt: document.querySelector("#generatedAt"),
  priorityCount: document.querySelector("#priorityCount"),
  journalCount: document.querySelector("#journalCount"),
  tagCount: document.querySelector("#tagCount"),
};

init();

async function init() {
  try {
    const response = await fetch("data/papers.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.papers = payload.papers || [];
    els.generatedAt.textContent = payload.generated_at ? `Updated ${formatDateTime(payload.generated_at)}` : "Not yet updated";
  } catch (error) {
    els.generatedAt.textContent = "No data file found";
    state.papers = [];
  }

  populateFilters();
  bindFilters();
  render();
}

function bindFilters() {
  els.search.addEventListener("input", () => {
    state.filters.query = els.search.value.trim().toLowerCase();
    render();
  });
  els.journal.addEventListener("change", () => {
    state.filters.journal = els.journal.value;
    render();
  });
  els.section.addEventListener("change", () => {
    state.filters.section = els.section.value;
    render();
  });
  els.tag.addEventListener("change", () => {
    state.filters.tag = els.tag.value;
    render();
  });
  els.date.addEventListener("change", () => {
    state.filters.days = els.date.value;
    render();
  });
}

function populateFilters() {
  fillSelect(els.journal, unique(state.papers.map((paper) => paper.journal)));
  fillSelect(els.section, unique(state.papers.map((paper) => paper.section).filter(Boolean)));
  fillSelect(els.tag, unique(state.papers.flatMap((paper) => paper.tags || [])));
}

function fillSelect(select, values) {
  const first = select.options[0];
  select.replaceChildren(first);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function render() {
  const papers = state.papers.filter(matchesFilters);
  els.paperCount.textContent = `${papers.length} ${papers.length === 1 ? "paper" : "papers"}`;
  els.priorityCount.textContent = state.papers.filter(isPriority).length;
  els.journalCount.textContent = unique(state.papers.map((paper) => paper.journal)).length;
  els.tagCount.textContent = unique(state.papers.flatMap((paper) => paper.tags || [])).length;

  els.papers.replaceChildren(...papers.map(renderPaper));
  els.empty.hidden = papers.length > 0;
}

function matchesFilters(paper) {
  const queryText = [
    paper.title,
    (paper.authors || []).join(" "),
    paper.journal,
    paper.doi,
    paper.abstract,
    paper.section,
    (paper.keywords || []).join(" "),
    (paper.tags || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (state.filters.query && !queryText.includes(state.filters.query)) return false;
  if (state.filters.journal && paper.journal !== state.filters.journal) return false;
  if (state.filters.section && paper.section !== state.filters.section) return false;
  if (state.filters.tag && !(paper.tags || []).includes(state.filters.tag)) return false;
  if (state.filters.days && !withinDays(paper.publication_date, Number(state.filters.days))) return false;
  return true;
}

function renderPaper(paper) {
  const article = document.createElement("article");
  article.className = `paper${isPriority(paper) ? " priority" : ""}`;

  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "#");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = paper.title;
  title.appendChild(link);

  const meta = document.createElement("div");
  meta.className = "meta";
  [
    paper.journal,
    formatDate(paper.publication_date),
    paper.section,
    paper.doi ? `DOI: ${paper.doi}` : null,
    authorLine(paper.authors),
  ]
    .filter(Boolean)
    .forEach((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      meta.appendChild(span);
    });

  article.append(title, meta);

  if (paper.abstract) {
    const abstract = document.createElement("p");
    abstract.className = "abstract";
    abstract.textContent = truncate(paper.abstract, 520);
    article.appendChild(abstract);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  (paper.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = `chip${tag === "priority section" ? " priority-chip" : ""}`;
    chip.textContent = tag;
    chips.appendChild(chip);
  });
  article.appendChild(chips);
  return article;
}

function isPriority(paper) {
  return (paper.tags || []).includes("priority section");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function withinDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function authorLine(authors = []) {
  if (!authors.length) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}...`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return dateString || "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return dateString;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
