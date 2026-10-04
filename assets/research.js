export function paperStorageKey(paper) {
  if (paper.doi) return `doi:${String(paper.doi).replace(/^https?:\/\/doi.org\//i, "").toLowerCase().trim()}`;
  return paper.id || `title:${(paper.title || "").toLowerCase().trim()}|${paper.publication_date || ""}|${paper.journal || ""}`;
}

export function matchesResearchQuery(paper, query, scope = "all") {
  if (!query.trim()) return true;
  const identity = [paper.title, paper.title_zh, paper.chinese_title, paper.doi, paper.url, paper.doi ? `https://doi.org/${paper.doi}` : "", ...(paper.authors || [])];
  const text = [...identity, ...(scope === "all" ? [paper.abstract, paper.abstract_zh, ...(paper.keywords || [])] : [])]
    .filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+OR\s+/i).some(group => {
    const tokens = group.match(/-?"[^"]+"|\S+/g) || [];
    return tokens.length > 0 && tokens.filter(token => !/^AND$/i.test(token)).every(token => {
      const exclude = token.startsWith("-") && token.length > 1;
      const term = (exclude ? token.slice(1) : token).replace(/^"|"$/g, "").toLowerCase();
      return term && (exclude ? !text.includes(term) : text.includes(term));
    });
  });
}

export function articleCategory(paper) {
  if (paper.source_group === "preprint_filtered") return "preprint";
  const title = paper.title || "";
  if (/\b(review|meta-analysis|meta analysis)\b/i.test(title)) return "review";
  if (/\b(randomi[sz]ed|clinical trial|controlled trial)\b/i.test(title)) return "trial";
  return "other";
}

export function createPaperLibrary(getStorage) {
  const namespace = "hearing-paper-monitor.library.v1";
  let items = Object.create(null);
  let storage;
  let warning = "";
  try {
    storage = getStorage();
    const saved = storage?.getItem(namespace);
    if (saved) items = validateBackup(JSON.parse(saved));
  } catch {
    warning = "Browser storage could not be read. Export a backup before leaving this page.";
  }
  function persist() {
    try {
      if (!storage) throw new Error("Browser storage unavailable");
      storage.setItem(namespace, JSON.stringify({version: 1, items}));
      warning = "";
      return true;
    } catch {
      warning = "Changes are saved only for this session. Export a backup before leaving this page.";
      return false;
    }
  }
  return {
    get(paper) { return items[paperStorageKey(paper)] || {}; },
    update(paper, patch) {
      const key = paperStorageKey(paper);
      const current = items[key] || {};
      const merged = {...current, ...patch, title: paper.title || "", doi: paper.doi || "",
                      updated_at: new Date().toISOString()};
      items[key] = cleanLibraryItem(merged);
      return persist();
    },
    export() { return JSON.stringify({version: 1, exported_at: new Date().toISOString(), items}, null, 2); },
    import(text) {
      const incoming = validateBackup(JSON.parse(text));
      for (const [key, entry] of Object.entries(incoming)) {
        if (!items[key] || (entry.updated_at || "") >= (items[key].updated_at || "")) items[key] = entry;
      }
      persist();
      return Object.keys(incoming).length;
    },
    get warning() { return warning; },
  };
}

function cleanLibraryItem(value) {
  return {favorite: value.favorite === true, read: value.read === true, later: value.later === true,
          note: typeof value.note === "string" ? value.note.slice(0, 20000) : "",
          title: typeof value.title === "string" ? value.title.slice(0, 2000) : "",
          doi: typeof value.doi === "string" ? value.doi.slice(0, 500) : "",
          updated_at: typeof value.updated_at === "string" ? value.updated_at.slice(0, 50) : ""};
}

function validateBackup(value) {
  if (!value || value.version !== 1 || !value.items || typeof value.items !== "object" || Array.isArray(value.items)) {
    throw new Error("Choose a Hearing Science Monitor library backup (version 1).");
  }
  const items = Object.create(null);
  if (Object.keys(value.items).length > 50000) throw new Error("Backup is too large.");
  for (const [key, entry] of Object.entries(value.items)) {
    if (!["__proto__", "constructor", "prototype"].includes(key) && key.length <= 4000
        && entry && typeof entry === "object" && !Array.isArray(entry)) {
      items[key] = cleanLibraryItem(entry);
    } else {
      throw new Error("Invalid library record in backup.");
    }
  }
  return items;
}

export function matchesLibraryView(entry, view) {
  if (view === "unread") return !entry.read;
  return !view || entry[view] === true;
}

export function uniqueBatchBibTeX(papers, generate) {
  const counts = new Map();
  const used = new Set();
  return papers.map(paper => {
    const text = generate(paper);
    return text.replace(/^(@\w+\{)([^,]+),/, (_, prefix, key) => {
      let count = (counts.get(key) || 0) + 1;
      let candidate = count > 1 ? `${key}_${count}` : key;
      while (used.has(candidate)) {
        count += 1;
        candidate = `${key}_${count}`;
      }
      counts.set(key, count);
      used.add(candidate);
      return `${prefix}${candidate},`;
    });
  }).join("\n\n");
}
