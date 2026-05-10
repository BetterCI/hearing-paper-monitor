const state = {
  papers: [],
  targetLanguage: detectPreferredTargetLanguage(),
  translatedTitles: new Map(),
  titleTranslationStatus: "idle",
  filters: {
    query: "",
    journal: "",
    section: "",
    tag: "",
    month: "",
    showOtherJasaSections: false,
  },
};

const EARLY_ACCESS_MONTH = "__early_access";

const LANGUAGE_OPTIONS = [
  ["zh", "简体中文"],
  ["zh-Hant", "繁體中文"],
  ["original", "Original English"],
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["de", "German"],
  ["el", "Greek"],
  ["es", "Spanish"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["hi", "Hindi"],
  ["hr", "Croatian"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["nl", "Dutch"],
  ["no", "Norwegian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["sv", "Swedish"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"],
];

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

const JOURNAL_STYLES = {
  "The Journal of the Acoustical Society of America": { color: "#0b6f72", background: "#eef8f7", logo: "JASA", sublogo: "ASA" },
  "JASA Express Letters": { color: "#7c3aed", background: "#f3edff", logo: "JASA", sublogo: "EL" },
  "Trends in Hearing": { color: "#d97706", background: "#fff7e8", logo: "TiH", sublogo: "SAGE" },
  "Journal of the Association for Research in Otolaryngology": { color: "#2563eb", background: "#edf4ff", logo: "JARO", sublogo: "ARO" },
  "Ear and Hearing": { color: "#c026d3", background: "#fdf0ff", logo: "E&H", sublogo: "AAS" },
  "Hearing Research": { color: "#15803d", background: "#effaf2", logo: "HR", sublogo: "ELS" },
};

const RELEVANT_TAGS = new Set([
  "cochlear implant",
  "hearing aid",
  "psychoacoustics",
  "speech perception",
  "auditory physiology",
  "clinical audiology",
  "real-world listening",
]);

const RELEVANT_TERMS = [
  "hearing",
  "auditory",
  "cochlear",
  "otolaryngology",
  "audiology",
  "audiogram",
  "tinnitus",
  "speech",
  "speech-in-noise",
  "speech in noise",
  "speech perception",
  "speech recognition",
  "speech intelligibility",
  "psychoacoustic",
  "masking",
  "loudness",
  "pitch",
  "listening",
  "hearing aid",
  "cochlear implant",
  "otoacoustic",
  "brainstem response",
  "auditory cortex",
];

const JASA_JOURNALS = new Set([
  "The Journal of the Acoustical Society of America",
  "JASA Express Letters",
]);

const JASA_SECTION_HIGHLIGHTS = new Set([
  "Speech Communication",
  "Psychological and Physiological Acoustics",
]);

const PUBLIC_TAG_LABELS = {
  "cochlear implant": "Cochlear Implants",
  "hearing aid": "Hearing Aids",
  "speech perception": "Speech Perception",
  psychoacoustics: "Psychoacoustics",
  "auditory physiology": "Auditory Physiology",
  "clinical audiology": "Clinical Audiology",
  "machine learning": "Machine Learning",
  "real-world listening": "Real-world Listening",
};

const TAG_INFERENCE_RULES = [
  { label: "Artificial Hearing", terms: ["artificial hearing", "electric hearing", "cochlear implant", "auditory prosthesis", "auditory prostheses"] },
  { label: "Hearing Healthcare AI", terms: ["hearing healthcare ai", "artificial intelligence", "deep learning", "machine learning", "neural network", "deep neural network", "large language model"] },
  { label: "Auditory Prostheses", terms: ["cochlear implant", "cochlear implants", "hearing aid", "hearing aids", "auditory prosthesis", "auditory prostheses"] },
  { label: "Binaural Hearing", terms: ["binaural", "bilateral", "spatial hearing", "interaural", "sound localization"] },
  { label: "Speech-in-Noise", terms: ["speech in noise", "speech-in-noise", "speech recognition in noise", "speech perception in noise", "speech intelligibility in noise"] },
  { label: "Objective Evaluation", terms: ["objective evaluation", "objective measure", "auditory brainstem response", "abr", "assr", "eeg", "mismatch negativity", "otoacoustic"] },
  { label: "Clinical relevance", terms: ["clinical", "patient", "diagnosis", "outcome", "rehabilitation", "audiology", "hearing loss", "tinnitus"] },
  { label: "Methodological relevance", terms: ["method", "measurement", "validation", "assessment", "protocol", "recording", "analysis"] },
  { label: "Technology-focused", terms: ["device", "technology", "algorithm", "software", "compressor", "hearing aid", "cochlear implant"] },
  { label: "Review-worthy", terms: ["review", "systematic review", "meta-analysis", "scoping review"] },
  { label: "Emerging topic", terms: ["emerging", "deep neural", "large language model", "artificial intelligence"] },
];

const CONCLUSION_CUES = [
  "we conclude",
  "we found",
  "we show",
  "we demonstrate",
  "we suggest",
  "results show",
  "results suggest",
  "results indicate",
  "findings suggest",
  "findings indicate",
  "these findings",
  "this study shows",
  "this study demonstrates",
  "this study suggests",
  "the results show",
  "the results suggest",
  "the results indicate",
  "demonstrate that",
  "suggest that",
  "indicate that",
  "revealed that",
  "showed that",
  "found that",
  "support the",
  "highlight",
  "benefit",
  "improve",
  "in conclusion",
  "consequently",
];

const CODE_URL_PATTERN = /(https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org|zenodo\.org|osf\.io|figshare\.com|codeocean\.com|huggingface\.co|sourceforge\.net)\/[^\s)"'<>]+)/i;

const CODE_CUES = [
  "code is available",
  "source code",
  "analysis code",
  "open-source code",
  "open source code",
  "software is available",
  "repository",
  "github.com",
  "gitlab.com",
  "code ocean",
  "codeocean",
  "osf.io",
  "zenodo.org",
  "huggingface.co",
];

const els = {
  papers: document.querySelector("#papers"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  journal: document.querySelector("#journalFilter"),
  section: document.querySelector("#sectionFilter"),
  tag: document.querySelector("#tagFilter"),
  month: document.querySelector("#monthFilter"),
  showOtherJasaSections: document.querySelector("#showOtherJasaSections"),
  paperCount: document.querySelector("#paperCount"),
  generatedAt: document.querySelector("#generatedAt"),
  refreshData: document.querySelector("#refreshData"),
  translationStatus: null,
  latestUpdates: document.querySelector("#latestUpdates"),
  sectionHighlights: document.querySelector("#sectionHighlights"),
  trendingTopics: document.querySelector("#trendingTopics"),
  selectedRecentPapers: document.querySelector("#selectedRecentPapers"),
  weeklyDigestWindow: document.querySelector("#weeklyDigestWindow"),
  weeklyTotal: document.querySelector("#weeklyTotal"),
  weeklyJournalCounts: document.querySelector("#weeklyJournalCounts"),
  weeklyTopicCounts: document.querySelector("#weeklyTopicCounts"),
  weeklyTopTopics: document.querySelector("#weeklyTopTopics"),
  weeklySelectedPapers: document.querySelector("#weeklySelectedPapers"),
};

init();

function detectPreferredTargetLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith("en")) return "original";
    if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo" || normalized.includes("hant")) return "zh-Hant";
    if (normalized.startsWith("zh")) return "zh";
    const base = normalized.split("-")[0];
    if (LANGUAGE_OPTIONS.some(([code]) => code === base)) return base;
  }
  return "original";
}

async function init() {
  await loadData();
  populateFilters();
  addLanguageControl();
  bindFilters();
  render();
}

async function loadData() {
  try {
    const response = await fetch(`data/papers.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.papers = payload.papers || [];
    state.translatedTitles.clear();
    state.titleTranslationStatus = "idle";
    setTranslatableText(els.generatedAt, payload.generated_at ? `Updated ${formatDateTime(payload.generated_at)}` : "Not yet updated");
  } catch (error) {
    setTranslatableText(els.generatedAt, "No data file found");
    state.papers = [];
  }
}

function addLanguageControl() {
  const controls = document.querySelector(".controls");
  const label = document.createElement("label");
  label.className = "browser-translate";
  label.innerHTML = `
    <span>Browser Translate</span>
    <select id="languageFilter">
    </select>
    <small id="translationStatus" class="translate-status">Original English</small>
  `;
  controls.appendChild(label);
  els.language = document.querySelector("#languageFilter");
  els.translationStatus = document.querySelector("#translationStatus");
  LANGUAGE_OPTIONS.forEach(([value, labelText]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    els.language.appendChild(option);
  });
  els.language.value = state.targetLanguage;
  markTranslatablePlaceholder(els.search, "Title, author, DOI, abstract...");
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
  els.month.addEventListener("change", () => {
    state.filters.month = els.month.value;
    render();
  });
  els.showOtherJasaSections.addEventListener("change", () => {
    state.filters.showOtherJasaSections = els.showOtherJasaSections.checked;
    render();
  });
  els.refreshData.addEventListener("click", async () => {
    els.refreshData.disabled = true;
    setTranslatableText(els.refreshData, "Refreshing...");
    await loadData();
    populateFilters();
    render();
    setTranslatableText(els.refreshData, "Refresh");
    els.refreshData.disabled = false;
  });
  els.language.addEventListener("change", () => {
    state.targetLanguage = els.language.value;
    state.translatedTitles.clear();
    state.titleTranslationStatus = "idle";
    render();
  });
}

function populateFilters() {
  fillSelect(els.journal, unique(state.papers.map((paper) => paper.journal)));
  fillSelect(els.section, unique(state.papers.map((paper) => paper.section).filter(Boolean)));
  fillTagSelect();
  populateMonthFilter();
}

function fillSelect(select, values) {
  const first = select.options[0];
  select.replaceChildren(first);
  markTranslatable(first, first.dataset.sourceText || first.textContent);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function fillTagSelect() {
  const first = els.tag.options[0];
  els.tag.replaceChildren(first);
  markTranslatable(first, first.dataset.sourceText || first.textContent);
  unique(state.papers.flatMap(publicPaperTags)).forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    markTranslatable(option, label);
    els.tag.appendChild(option);
  });
}

function render() {
  try {
    const papers = state.papers.filter(matchesFilters);
    setTranslatableText(els.paperCount, `${papers.length} ${papers.length === 1 ? "paper" : "papers"}`);

    renderRecentOverview();
    renderWeeklyDigest();
    els.papers.replaceChildren(...papers.map(renderPaper));
    els.empty.hidden = papers.length > 0;
    markStaticUiForTranslation();
    translateVisibleTitles(papers);
    translateRenderedPage();
  } catch (e) {
    console.error("Render error:", e);
  }
}

function populateMonthFilter() {
  const months = unique(state.papers.map(getPaperMonth).filter(Boolean)).sort().reverse();
  const hasEarlyAccess = state.papers.some(isEarlyAccess);
  const options = hasEarlyAccess ? [...months, EARLY_ACCESS_MONTH] : months;
  els.month.replaceChildren();
  months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonth(month);
    els.month.appendChild(option);
  });
  if (hasEarlyAccess) {
    const option = document.createElement("option");
    option.value = EARLY_ACCESS_MONTH;
    option.textContent = "Early access";
    markTranslatable(option, "Early access");
    els.month.appendChild(option);
  }

  if (!state.filters.month || !options.includes(state.filters.month)) {
    state.filters.month = months[0] || "";
  }
  els.month.value = state.filters.month;
}

function matchesFilters(paper) {
  const queryText = [
    paper.title,
    paper.title_zh,
    paper.chinese_title,
    (paper.authors || []).join(" "),
    paper.journal,
    paper.doi,
    paper.abstract,
    paper.abstract_zh,
    paper.chinese_abstract,
    paper.section,
    paper.publication_stage,
    ...analysisSearchTerms(paper),
    ...publicPaperTags(paper),
    (paper.keywords || []).join(" "),
    (paper.tags || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (state.filters.query && !queryText.includes(state.filters.query)) return false;
  if (state.filters.journal && paper.journal !== state.filters.journal) return false;
  if (state.filters.section && paper.section !== state.filters.section) return false;
  if (state.filters.tag && !publicPaperTags(paper).includes(state.filters.tag)) return false;
  if (state.filters.month === EARLY_ACCESS_MONTH && !isEarlyAccess(paper)) return false;
  if (state.filters.month && state.filters.month !== EARLY_ACCESS_MONTH && getPaperMonth(paper) !== state.filters.month) return false;
  if (!state.filters.showOtherJasaSections && isOtherJasaSectionPaper(paper)) return false;
  return true;
}

function renderPaper(paper) {
  const article = document.createElement("article");
  const related = isSpeechOrHearingRelated(paper);
  const jasaOffTopic = JASA_JOURNALS.has(paper.journal) && !related;
  article.className = [
    "paper",
    related ? "related-paper" : "",
    jasaOffTopic ? "jasa-offtopic" : "",
    isJasaSectionHighlight(paper) ? "section-highlight" : "",
  ]
    .filter(Boolean)
    .join(" ");
  applyJournalStyle(article, paper.journal);

  const heading = document.createElement("div");
  heading.className = "paper-heading";
  heading.appendChild(renderJournalLogo(paper.journal));

  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "#");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = displayTitle(paper);
  title.appendChild(link);
  heading.appendChild(title);

  const translatedTitle = renderTranslatedTitle(paper);
  if (translatedTitle) {
    heading.appendChild(translatedTitle);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  [
    journalDisplayName(paper.journal),
    displayDate(paper),
    authorLine(paper.authors),
    paper.first_author_affiliation ? `First affiliation: ${paper.first_author_affiliation}` : null,
  ]
    .filter(Boolean)
    .forEach((text) => {
      meta.appendChild(renderMetaText(text));
    });
  if (isEarlyAccess(paper)) {
    meta.appendChild(renderStageBadge("Early access"));
  }
  if (paper.doi) {
    meta.appendChild(renderMetaLink(`DOI`, doiUrl(paper.doi)));
  }

  const codeInfo = getCodeInfo(paper);
  if (codeInfo) {
    meta.appendChild(renderCodeLink(codeInfo));
  }

  meta.appendChild(renderCiteButton(paper));

  article.append(heading, meta);

  const abstractText = displayAbstract(paper);
  if (abstractText) {
    article.appendChild(renderAbstract(abstractText));
  }

  const aiAnalysis = renderAiAnalysis(paper);
  if (aiAnalysis) {
    article.appendChild(aiAnalysis);
  }

  const media = renderKeyMedia(paper);
  if (media) {
    article.appendChild(media);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  publicPaperTags(paper).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    markTranslatable(chip, tag);
    chips.appendChild(chip);
  });
  article.appendChild(chips);
  return article;
}

function renderRecentOverview() {
  const sorted = sortedPapers(state.papers);
  renderCompactPaperList(els.latestUpdates, sorted.slice(0, 5), { featureFirst: true });

  const highlights = sorted.filter(isJasaSectionHighlight).slice(0, 4);
  renderCompactPaperList(els.sectionHighlights, highlights, { showSection: true });

  const recentWindow = papersInLatestWindow(state.papers, 30);
  const overviewSource = recentWindow.length >= 8 ? recentWindow : sorted.slice(0, 30);
  renderTopicList(els.trendingTopics, topTagCounts(overviewSource, 8));

  const selectedSource = papersInLatestWindow(state.papers, 7);
  renderCompactPaperList(els.selectedRecentPapers, selectRecentPapers(selectedSource, 6), { showTags: true });
}

function renderWeeklyDigest() {
  const weekly = papersInLatestWindow(state.papers, 7);
  const sortedWeekly = sortedPapers(weekly);
  const latestDate = maxPaperDate(state.papers);
  const startDate = latestDate ? addDays(latestDate, -6) : null;

  if (els.weeklyDigestWindow) els.weeklyDigestWindow.textContent = startDate && latestDate ? `${formatDate(toDateString(startDate))} - ${formatDate(toDateString(latestDate))}` : "No dated papers available";
  if (els.weeklyTotal) els.weeklyTotal.textContent = String(sortedWeekly.length);
  if (els.weeklyJournalCounts) {
    const topicCounts = topTagCounts(sortedWeekly, 10);
    renderCountList(els.weeklyJournalCounts, countValues(sortedWeekly.map((paper) => paper.journal)).slice(0, 8));
    renderCountList(els.weeklyTopicCounts, topicCounts);
    renderTopicList(els.weeklyTopTopics, topicCounts.slice(0, 5));
  }
}

function renderCompactPaperList(container, papers, options = {}) {
  container.replaceChildren();
  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, "No papers available for this view.");
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  if (options.featureFirst) list.classList.add("is-featured-list");
  papers.forEach((paper, index) => {
    const item = document.createElement("li");
    if (options.featureFirst && index === 0) item.className = "compact-feature";
    const link = document.createElement("a");
    link.href = paper.url || (paper.doi ? doiUrl(paper.doi) : "#");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = paper.title;
    markTranslatable(link, paper.title);
    item.appendChild(link);

    if (options.showChineseTitle && paper.title_zh) {
      const chineseTitle = document.createElement("p");
      chineseTitle.className = "compact-translation";
      chineseTitle.textContent = paper.title_zh;
      item.appendChild(chineseTitle);
    }

    const meta = document.createElement("p");
    meta.className = "compact-meta";
    [
      paper.journal,
      displayDate(paper),
      options.showSection ? paper.section : null,
    ]
      .filter(Boolean)
      .forEach((part, index) => {
        if (index > 0) meta.appendChild(document.createTextNode(" · "));
        meta.appendChild(document.createTextNode(part));
      });
    const sourceUrl = paper.doi ? doiUrl(paper.doi) : paper.url;
    if (sourceUrl) {
      if (meta.childNodes.length) meta.appendChild(document.createTextNode(" / "));
      const source = document.createElement("a");
      source.className = "compact-source-link";
      source.href = sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = paper.doi ? "DOI" : "Publisher";
      if (paper.doi) source.title = paper.doi;
      meta.appendChild(source);
    }
    item.appendChild(meta);

    if (options.showTags) {
      const tags = publicPaperTags(paper).slice(0, 4);
      if (tags.length) {
        const tagLine = document.createElement("div");
        tagLine.className = "mini-tags";
        tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        markTranslatable(chip, tag);
        tagLine.appendChild(chip);
      });
        item.appendChild(tagLine);
      }
    }

    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderTopicList(container, counts) {
  container.replaceChildren();
  if (!counts.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, "No topics available for this period.");
    container.appendChild(empty);
    return;
  }
  counts.forEach(([label, count]) => {
    const topic = document.createElement("span");
    topic.className = "topic-pill";
    setTranslatableText(topic, `${label} ${count}`);
    container.appendChild(topic);
  });
}

function renderCountList(container, counts) {
  container.replaceChildren();
  if (!counts.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    setTranslatableText(empty, "No counts available for this period.");
    container.appendChild(empty);
    return;
  }
  counts.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "count-row";
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = count;
    row.append(name, value);
    container.appendChild(row);
  });
}

function selectRecentPapers(papers, limit) {
  const byJournal = new Set();
  const scored = sortedPapers(papers)
    .map((paper) => ({ paper, score: paperRelevanceScore(paper) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || comparePaperDates(left.paper, right.paper));

  const selected = [];
  scored.forEach(({ paper }) => {
    if (selected.length >= limit) return;
    if (!byJournal.has(paper.journal) || selected.length >= Math.ceil(limit / 2)) {
      selected.push(paper);
      byJournal.add(paper.journal);
    }
  });

  if (selected.length < limit) {
    scored.forEach(({ paper }) => {
      if (selected.length >= limit) return;
      if (!selected.includes(paper)) selected.push(paper);
    });
  }

  return selected.slice(0, limit);
}

function paperRelevanceScore(paper) {
  const tags = publicPaperTags(paper);
  let score = tags.length;
  const textLower = [
    paper.title,
    ...(paper.keywords || []),
    ...(paper.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const priorityTerms = [
    "cochlear implant", "hearing aid", "audiometry", "speech perception",
    "signal processing", "fitting", "mapping", "encoding",
    "psychoacoustics", "auditory model", "neural encoding",
    "binaural", "sound localization", "speech coding",
    "auditory prosthesis", "cochlear implant", "hearing prosthesis",
    "otoneurophysiology", "auditory nerve", "compound action potential",
  ];
  const hasPriority = priorityTerms.some((term) => textLower.includes(term));
  if (hasPriority) score += 5;
  if (isJasaSectionHighlight(paper)) score += 2;
  if (getAiAnalysis(paper)) score += 1;
  if (paper.abstract) score += 1;
  if (tags.some((tag) => ["Clinical Audiology", "Speech Perception", "Auditory Neuroscience", "Machine Learning", "Objective Evaluation"].includes(tag))) {
    score += 2;
  }
  return score;
}

function applyJournalStyle(element, journal) {
  const style = JOURNAL_STYLES[journal] || { color: "#64748b", background: "#f8fafc" };
  element.style.setProperty("--journal-color", style.color);
  element.style.setProperty("--journal-bg", style.background);
}

function renderJournalLogo(journal) {
  const style = JOURNAL_STYLES[journal] || { logo: "J", sublogo: "JOURNAL" };
  const logo = document.createElement("div");
  logo.className = "journal-logo";
  logo.setAttribute("aria-label", `${journal} logo`);
  logo.title = journal;

  const main = document.createElement("span");
  main.className = "journal-logo-main";
  main.textContent = style.logo;

  const sub = document.createElement("span");
  sub.className = "journal-logo-sub";
  sub.textContent = style.sublogo;

  logo.append(main, sub);
  return logo;
}

function renderMetaText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function renderMetaLink(text, url) {
  const link = document.createElement("a");
  link.className = "meta-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  if (!text.startsWith("DOI:")) markTranslatable(link, text);
  return link;
}

function renderCodeLink(codeInfo) {
  if (codeInfo.url) {
    const link = renderMetaLink(codeInfo.label, codeInfo.url);
    link.classList.add("code-link");
    return link;
  }
  const span = document.createElement("span");
  span.className = "code-link";
  span.textContent = codeInfo.label;
  return span;
}

function renderStageBadge(text) {
  const span = document.createElement("span");
  span.className = "stage-badge";
  span.textContent = text;
  markTranslatable(span, text);
  return span;
}

function renderKeyMedia(paper) {
  if (!paper.key_image_url && !paper.key_formula) return null;

  const media = document.createElement("div");
  media.className = "key-media";

  if (paper.key_image_url && !isPdfUrl(paper.key_image_url)) {
    const figure = document.createElement("figure");
    figure.className = "key-figure";

    const image = document.createElement("img");
    image.src = paper.key_image_url;
    image.alt = paper.key_image_alt || `Key image from ${paper.journal}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      figure.hidden = true;
    });

    const caption = document.createElement("figcaption");
    caption.textContent = paper.key_image_alt || "Key image from the official article page";
    markTranslatable(caption, caption.textContent);

    figure.append(image, caption);
    media.appendChild(figure);
  }

  if (paper.key_formula) {
    const formula = document.createElement("div");
    formula.className = "key-formula";
    const label = document.createElement("span");
    label.className = "key-formula-label";
    label.textContent = "Key formula";
    markTranslatable(label, "Key formula");
    const code = document.createElement("code");
    code.textContent = paper.key_formula;
    formula.append(label, code);
    media.appendChild(formula);
  }

  return media;
}

function renderAiAnalysis(paper) {
  const analysis = getAiAnalysis(paper);
  if (!analysis) return null;

  const wrapper = document.createElement("section");
  wrapper.className = "ai-analysis";
  wrapper.setAttribute("aria-label", "AI-generated abstract analysis");

  const title = document.createElement("h3");
  title.textContent = "AI-Generated Abstract Analysis";

  const list = document.createElement("dl");
  [
    ["Scientific question", analysis.scientific_question],
    ["Highlight", analysis.key_highlight],
    ["Limitation", analysis.main_limitation],
  ].forEach(([label, value]) => {
    if (!value) return;
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    list.append(term, detail);
  });

  const footer = document.createElement("p");
  footer.className = "ai-analysis-footer";
  const model = analysis.model || "MiniMax-M2.7";
  footer.textContent = `Generated by ${model}`;

  wrapper.append(title, list, footer);
  return list.children.length ? wrapper : null;
}

function getAiAnalysis(paper) {
  const analysis = paper.ai_analysis || paper.analysis;
  if (!analysis) return null;
  const values = {
    scientific_question: analysis.scientific_question || analysis.scientificQuestion,
    key_highlight: analysis.key_highlight || analysis.keyHighlight || analysis.highlight,
    main_limitation: analysis.main_limitation || analysis.mainLimitation || analysis.limitation,
  };
  return Object.values(values).some(Boolean) ? values : null;
}

function analysisSearchTerms(paper) {
  const analysis = getAiAnalysis(paper);
  if (!analysis) return [];
  return [analysis.scientific_question, analysis.key_highlight, analysis.main_limitation].filter(Boolean);
}

function doiUrl(doi) {
  const normalized = String(doi || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
  return `https://doi.org/${normalized}`;
}

const JOURNAL_ABBREV = {
  "The Journal of the Acoustical Society of America": "JASA",
  "JASA Express Letters": "JASA EL",
  "Journal of the Association for Research in Otolaryngology": "JARO",
  "Ear and Hearing": "Ear Hear",
  "Trends in Hearing": "Trends Hear",
  "Hearing Research": "Hear Res",
};

function journalDisplayName(journal) {
  return JOURNAL_ABBREV[journal] || journal;
}

function getFullTextUrl(paper) {
  const candidates = [
    paper.full_text_url,
    paper.fullTextUrl,
    paper.html_url,
    paper.open_access_url,
    paper.pmc_url,
    paper.url,
  ].filter(Boolean);
  const url = candidates.find((candidate) => !isPdfUrl(candidate));
  return url || "";
}

function isPdfUrl(url) {
  return /\.pdf($|[?#])/i.test(String(url));
}

function getCodeInfo(paper) {
  const explicitUrl = [
    paper.code_url,
    paper.codeUrl,
    paper.repository_url,
    paper.repository,
    paper.software_url,
  ].find(Boolean);
  if (explicitUrl && !isPdfUrl(explicitUrl)) {
    return { label: "Code available", url: explicitUrl };
  }

  const text = [
    paper.title,
    paper.abstract,
    ...(paper.keywords || []),
  ]
    .filter(Boolean)
    .join(" ");
  const urlMatch = text.match(CODE_URL_PATTERN);
  if (urlMatch) {
    return { label: "Code available", url: urlMatch[1] };
  }
  const lower = text.toLowerCase();
  if (CODE_CUES.some((cue) => lower.includes(cue))) {
    return { label: "Code availability noted" };
  }
  return null;
}

function isSpeechOrHearingRelated(paper) {
  const tags = paper.tags || [];
  if (tags.some((tag) => RELEVANT_TAGS.has(tag))) return true;
  const text = [
    paper.title,
    paper.abstract,
    paper.section,
    ...(paper.keywords || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return RELEVANT_TERMS.some((term) => text.includes(term));
}

function renderAbstract(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "abstract";
  splitParagraphs(text).forEach((paragraph) => {
    const paragraphElement = document.createElement("p");
    appendHighlightedParagraph(paragraphElement, paragraph);
    wrapper.appendChild(paragraphElement);
  });
  return wrapper;
}

function splitParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function appendHighlightedParagraph(element, paragraph) {
  const sentences = splitSentencesSafe(paragraph);
  const conclusionIndexes = findConclusionSentenceIndexes(sentences);
  sentences.forEach((sentence, index) => {
    if (index > 0) element.appendChild(document.createTextNode(" "));
    if (conclusionIndexes.has(index)) {
      const strong = document.createElement("strong");
      strong.textContent = sentence;
      markTranslatable(strong, sentence);
      element.appendChild(strong);
    } else {
      const span = document.createElement("span");
      span.textContent = sentence;
      markTranslatable(span, sentence);
      element.appendChild(span);
    }
  });
}

function splitSentencesSafe(text) {
  const matches = text.match(/[^.!?\u3002\uff01\uff1f]+[.!?\u3002\uff01\uff1f]?/g);
  return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [text];
}

function findConclusionSentenceIndexes(sentences) {
  const indexes = new Set();
  sentences.forEach((sentence, index) => {
    const lower = sentence.toLowerCase();
    if (CONCLUSION_CUES.some((cue) => lower.includes(cue))) {
      indexes.add(index);
    }
  });
  if (!indexes.size && sentences.length > 1) {
    indexes.add(sentences.length - 1);
  }
  return indexes;
}

function displayTitle(paper) {
  return paper.title;
}

function renderTranslatedTitle(paper) {
  const targetLanguage = state.targetLanguage;
  if (targetLanguage === "original") return null;

  const translated = state.translatedTitles.get(paperTitleKey(paper));
  const line = document.createElement("p");
  line.className = "translated-title";
  line.lang = targetLanguage;
  line.textContent = translated || `Translating title to ${languageLabel(targetLanguage)}...`;
  return line;
}

function displayAbstract(paper) {
  return paper.abstract || "";
}

function setTranslatableText(element, text) {
  element.textContent = text;
  markTranslatable(element, text, { updateSource: true });
}

function markTranslatable(element, text, options = {}) {
  if (!element || !text) return;
  element.classList.add("translatable-text");
  if (options.updateSource || !element.dataset.sourceText) {
    element.dataset.sourceText = text;
  }
  element.lang = "en";
}

function markTranslatablePlaceholder(element, text) {
  if (!element || !text) return;
  element.dataset.sourcePlaceholder = text;
}

function markStaticUiForTranslation() {
  document
    .querySelectorAll(
      [
        "h1",
        ".subtitle",
        ".controls label > span",
        ".status-actions button",
        ".status-actions a",
        ".section-heading h2",
        ".overview-panel h3",
        ".panel-note",
        ".digest-panel h3",
        ".digest-total span:last-child",
        "#emptyState",
      ].join(", ")
    )
    .forEach((element) => markTranslatable(element, element.dataset.sourceText || element.textContent.trim()));
  document
    .querySelectorAll("#journalFilter option[value=''], #sectionFilter option[value=''], #tagFilter option")
    .forEach((option) => markTranslatable(option, option.dataset.sourceText || option.textContent.trim()));
  markTranslatablePlaceholder(els.search, "Title, author, DOI, abstract...");
}

function restoreOriginalPageText() {
  document.querySelectorAll(".translatable-text").forEach((node) => {
    const source = node.dataset.sourceText;
    if (source) node.textContent = source;
    node.lang = "en";
    node.dir = "";
  });
  document.querySelectorAll("[data-source-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", node.dataset.sourcePlaceholder);
  });
}

function applySourceLanguageMode(targetLanguage) {
  document.documentElement.lang = "en";
  document.documentElement.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
  document.documentElement.dataset.translateTarget = targetLanguage;
}

function applyTranslatedLanguageMode(targetLanguage) {
  document.documentElement.lang = targetLanguage;
  document.documentElement.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
  document.documentElement.dataset.translateTarget = targetLanguage;
}

function isRtlLanguage(language) {
  return RTL_LANGUAGES.has(String(language || "").split("-")[0].toLowerCase());
}

async function translateRenderedPage() {
  if (!els.translationStatus) return;
  const targetLanguage = state.targetLanguage;
  const runId = Date.now().toString();
  state.translationRunId = runId;
  applySourceLanguageMode(targetLanguage);
  restoreOriginalPageText();

  if (targetLanguage === "original") {
    els.translationStatus.textContent = "Original English";
    return;
  }

  const label = languageLabel(targetLanguage);
  if (!("Translator" in self)) {
    els.translationStatus.textContent = `Use browser page translation for ${label}`;
    return;
  }

  const nodes = [...document.querySelectorAll(".translatable-text")];
  const placeholderNodes = [...document.querySelectorAll("[data-source-placeholder]")];
  if (!nodes.length && !placeholderNodes.length) {
    els.translationStatus.textContent = `No visible text to translate`;
    return;
  }

  els.translationStatus.textContent = `Preparing ${label} translation...`;

  try {
    const availability = await Translator.availability({
      sourceLanguage: "en",
      targetLanguage,
    });
    if (availability === "unavailable") {
      els.translationStatus.textContent = `Browser translation unavailable for ${label}`;
      return;
    }

    const translator = await Translator.create({
      sourceLanguage: "en",
      targetLanguage,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          if (state.translationRunId === runId) {
            els.translationStatus.textContent = `Downloading ${label} language pack ${Math.round(event.loaded * 100)}%`;
          }
        });
      },
    });

    for (const node of nodes) {
      if (state.translationRunId !== runId) return;
      const source = node.dataset.sourceText;
      if (source) {
        node.textContent = await translator.translate(source);
        node.lang = targetLanguage;
        node.dir = isRtlLanguage(targetLanguage) ? "rtl" : "ltr";
      }
    }
    for (const node of placeholderNodes) {
      if (state.translationRunId !== runId) return;
      const source = node.dataset.sourcePlaceholder;
      if (source) {
        node.setAttribute("placeholder", await translator.translate(source));
      }
    }
    applyTranslatedLanguageMode(targetLanguage);
    els.translationStatus.textContent = `Translated to ${label} with browser Translator`;
  } catch (error) {
    els.translationStatus.textContent = `Use browser page translation for ${label}`;
  }
}

async function translateVisibleTitles(papers) {
  const targetLanguage = state.targetLanguage;
  if (targetLanguage === "original") return;
  if (!("Translator" in self)) return;
  const missing = papers
    .filter((paper) => paper.title && !state.translatedTitles.has(paperTitleKey(paper)))
    .slice(0, 40);
  if (!missing.length || state.titleTranslationStatus === "running") return;

  state.titleTranslationStatus = "running";
  try {
    const availability = await Translator.availability({
      sourceLanguage: "en",
      targetLanguage,
    });
    if (availability === "unavailable") return;

    const translator = await Translator.create({
      sourceLanguage: "en",
      targetLanguage,
    });
    for (const paper of missing) {
      state.translatedTitles.set(paperTitleKey(paper), await translator.translate(paper.title));
    }
  } catch (error) {
    return;
  } finally {
    state.titleTranslationStatus = "idle";
  }
  render();
}

function paperTitleKey(paper) {
  const base = paper.doi || `${paper.journal}|${paper.publication_date}|${paper.title}`;
  return `${state.targetLanguage}|${base}`;
}

function languageLabel(value) {
  const option = LANGUAGE_OPTIONS.find(([code]) => code === value);
  return option ? option[1] : value;
}

function publicPaperTags(paper) {
  const labels = new Set();
  (paper.tags || []).forEach((tag) => {
    const label = PUBLIC_TAG_LABELS[tag];
    if (label) labels.add(label);
  });

  const text = paperText(paper);
  TAG_INFERENCE_RULES.forEach((rule) => {
    if (rule.terms.some((term) => text.includes(term))) {
      labels.add(rule.label);
    }
  });

  if ((paper.tags || []).includes("auditory physiology")) {
    labels.add("Auditory Neuroscience");
  }
  return [...labels].sort((left, right) => left.localeCompare(right));
}

function paperText(paper) {
  return [
    paper.title,
    paper.abstract,
    paper.section,
    ...(paper.keywords || []),
    ...(paper.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isJasaSectionHighlight(paper) {
  return JASA_JOURNALS.has(paper.journal) && JASA_SECTION_HIGHLIGHTS.has(paper.section);
}

function isEarlyAccess(paper) {
  return paper.publication_stage === "early_access" || paper.is_early_access === true;
}

function isOtherJasaSectionPaper(paper) {
  return JASA_JOURNALS.has(paper.journal) && !isJasaSectionHighlight(paper);
}

function sortedPapers(papers) {
  return [...papers].sort(comparePaperDates);
}

function comparePaperDates(left, right) {
  const leftDate = Date.parse(`${effectiveDate(left) || ""}T00:00:00`);
  const rightDate = Date.parse(`${effectiveDate(right) || ""}T00:00:00`);
  const safeLeft = Number.isNaN(leftDate) ? 0 : leftDate;
  const safeRight = Number.isNaN(rightDate) ? 0 : rightDate;
  if (safeRight !== safeLeft) return safeRight - safeLeft;
  return String(left.title || "").localeCompare(String(right.title || ""));
}

function papersInLatestWindow(papers, days) {
  const latest = maxPaperDate(papers);
  if (!latest) return [];
  const start = addDays(latest, -(days - 1));
  return papers.filter((paper) => {
    const date = parsePaperDate(effectiveDate(paper));
    return date && date >= start && date <= latest;
  });
}

function papersFromRecentPastThroughFuture(papers, daysBack) {
  const today = currentLocalDate();
  const start = addDays(today, -daysBack);
  return papers.filter((paper) => {
    const date = parsePaperDate(effectiveDate(paper));
    return date && date >= start;
  });
}

function maxPaperDate(papers) {
  const dates = papers.map((paper) => parsePaperDate(effectiveDate(paper))).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function effectiveDate(paper) {
  if (isEarlyAccess(paper) && paper.available_online_date) {
    return paper.available_online_date;
  }
  return paper.publication_date;
}

function parsePaperDate(dateString) {
  const date = new Date(`${dateString || ""}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function currentLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function topTagCounts(papers, limit) {
  return countValues(papers.flatMap(publicPaperTags)).slice(0, limit);
}

function countValues(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
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

function getPaperMonth(paper) {
  let dateString = paper.publication_date || "";
  if (isEarlyAccess(paper) && paper.available_online_date) {
    dateString = paper.available_online_date;
  }
  return /^\d{4}-\d{2}/.test(dateString) ? dateString.slice(0, 7) : "";
}

function authorLine(authors = []) {
  if (!authors.length) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return dateString || "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function displayDate(paper) {
  if (isEarlyAccess(paper) && paper.available_online_date) {
    return `${formatDate(paper.available_online_date)} (online)`;
  }
  return formatDate(paper.publication_date);
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

function formatMonth(monthString) {
  const date = new Date(`${monthString}-01T00:00:00`);
  if (Number.isNaN(date.valueOf())) return monthString;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(date);
}

// Citation export functions

function generateRIS(paper) {
  const lines = ["TY  - JOUR"];
  if (paper.title) lines.push(`TI  - ${paper.title}`);
  if (paper.authors?.length) {
    paper.authors.forEach((author) => lines.push(`AU  - ${author}`));
  }
  if (paper.journal) lines.push(`JO  - ${paper.journal}`);
  if (paper.publication_date) {
    const year = paper.publication_date.slice(0, 4);
    if (year) lines.push(`PY  - ${year}`);
  }
  if (paper.volume) lines.push(`VL  - ${paper.volume}`);
  if (paper.issue) lines.push(`IS  - ${paper.issue}`);
  if (paper.pages) {
    const pageParts = paper.pages.split("-");
    if (pageParts.length >= 2) {
      lines.push(`SP  - ${pageParts[0]}`);
      lines.push(`EP  - ${pageParts[1]}`);
    } else {
      lines.push(`SP  - ${paper.pages}`);
    }
  }
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  const url = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null);
  if (url) lines.push(`UR  - ${url}`);
  if (paper.abstract) lines.push(`AB  - ${paper.abstract}`);
  lines.push("ER  -");
  return lines.join("\n");
}

function generateBibTeX(paper) {
  const fields = [];
  if (paper.title) fields.push(`  title = {${escapeBibTeX(paper.title)}}`);
  if (paper.authors?.length) {
    const authorStr = paper.authors.join(" and ");
    fields.push(`  author = {${escapeBibTeX(authorStr)}}`);
  }
  if (paper.journal) fields.push(`  journal = {${escapeBibTeX(paper.journal)}}`);
  if (paper.publication_date) {
    const year = paper.publication_date.slice(0, 4);
    if (year) fields.push(`  year = {${year}}`);
  }
  if (paper.volume) fields.push(`  volume = {${paper.volume}}`);
  if (paper.issue) fields.push(`  number = {${paper.issue}}`);
  if (paper.pages) fields.push(`  pages = {${paper.pages}}`);
  if (paper.doi) fields.push(`  doi = {${paper.doi}}`);
  const url = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null);
  if (url) fields.push(`  url = {${url}}`);
  if (paper.abstract && !paper.ai_analysis?.abstract) {
    fields.push(`  abstract = {${escapeBibTeX(paper.abstract)}}`);
  }
  const key = generateCitationKey(paper);
  return `@article{${key},\n${fields.join(",\n")}\n}`;
}

function escapeBibTeX(text) {
  return String(text)
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function generateCitationKey(paper) {
  const firstAuthor = paper.authors?.[0] || "";
  const surname = firstAuthor.split(/\s+/).pop() || "paper";
  const year = (paper.publication_date || "").slice(0, 4) || "2026";
  const shortTitle = (paper.title || "")
    .split(/\s+/)
    .slice(0, 3)
    .join("_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return `${surname}${year}${shortTitle}`.replace(/[^a-zA-Z0-9]/g, "");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showCopyFeedback(message) {
  let feedback = document.querySelector(".cite-copy-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.className = "cite-copy-feedback";
    document.body.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.classList.add("show");
  setTimeout(() => feedback.classList.remove("show"), 1500);
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function openCiteDropdown(button) {
  const dropdown = button.closest(".cite-dropdown");
  if (!dropdown) return;
  document.querySelectorAll(".cite-dropdown-menu.open").forEach((menu) => menu.classList.remove("open"));
  dropdown.querySelector(".cite-dropdown-menu")?.classList.add("open");
  const closeHandler = (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.querySelector(".cite-dropdown-menu")?.classList.remove("open");
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

function renderCiteButton(paper) {
  const wrapper = document.createElement("div");
  wrapper.className = "cite-dropdown";

  const button = document.createElement("button");
  button.className = "cite-button";
  button.type = "button";
  button.textContent = "Cite / Save";
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    openCiteDropdown(button);
  });

  const menu = document.createElement("div");
  menu.className = "cite-dropdown-menu";

  const doi = paper.doi;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const url = paper.url || doiUrl;
  const bibtex = generateBibTeX(paper);
  const ris = generateRIS(paper);
  const key = generateCitationKey(paper);

  const items = [];

  items.push({ label: "Download RIS", action: () => downloadFile(ris, `${key}.ris`, "application/x-research-info-systems") });
  items.push({ label: "Download BibTeX", action: () => downloadFile(bibtex, `${key}.bib`, "application/x-bibtex") });

  if (doi) {
    items.push({ divider: true });
    items.push({ label: "Copy DOI", action: () => copyToClipboard(doi).then(() => showCopyFeedback("DOI copied")) });
    items.push({ label: "Copy DOI link", action: () => copyToClipboard(doiUrl).then(() => showCopyFeedback("DOI link copied")) });
  }

  if (url && url !== doiUrl) {
    items.push({ label: "Copy publisher link", action: () => copyToClipboard(url).then(() => showCopyFeedback("Publisher link copied")) });
  }

  items.forEach((item) => {
    if (item.divider) {
      const divider = document.createElement("div");
      divider.className = "divider";
      menu.appendChild(divider);
    } else {
      const menuItem = document.createElement("button");
      menuItem.type = "button";
      menuItem.textContent = item.label;
      menuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        item.action();
      });
      menu.appendChild(menuItem);
    }
  });

  wrapper.append(button, menu);
  return wrapper;
}
