import fs from "node:fs";
import path from "node:path";

const POS_SHORT = {
  noun: "n",
  verb: "v",
  adjective: "adj",
  adverb: "adv",
  preposition: "prep",
  conjunction: "conj",
  pronoun: "pron",
  determiner: "det",
  interjection: "interj",
};

function parseArgs(argv) {
  const out = { input: null, output: null, dryRun: false, concurrency: 6 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--input") out.input = argv[++i] ?? null;
    else if (a === "--output") out.output = argv[++i] ?? null;
    else if (a === "--concurrency") out.concurrency = Math.max(1, Math.min(20, Number.parseInt(argv[++i] ?? "6", 10) || 6));
  }
  if (!out.input) throw new Error("Missing --input <path>");
  if (!out.output) throw new Error("Missing --output <path>");
  return out;
}

function wordHasPosSuffix(word) {
  return /\(([^()]+)\)\s*$/.test(word);
}

function normalizeQueryWord(raw) {
  const w = String(raw).trim();
  // If user already has "(...)" suffix, strip it for lookup
  const m = w.match(/^(.*?)(?:\s*)\(([^()]+)\)\s*$/);
  const base = (m ? m[1] : w).trim();
  return base;
}

function mapPartOfSpeechToShort(pos) {
  const key = String(pos).trim().toLowerCase();
  if (key in POS_SHORT) return POS_SHORT[key];
  if (key === "adj") return "adj";
  if (key === "adv") return "adv";
  if (key === "n") return "n";
  if (key === "v") return "v";
  return null;
}

async function fetchPartsOfSpeech(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) return null;
  const json = await res.json();
  if (!Array.isArray(json)) return null;
  const pos = new Set();
  for (const entry of json) {
    if (!entry || typeof entry !== "object") continue;
    const meanings = entry.meanings;
    if (!Array.isArray(meanings)) continue;
    for (const m of meanings) {
      const p = m?.partOfSpeech;
      if (typeof p === "string") pos.add(p);
    }
  }
  const mapped = Array.from(pos)
    .map(mapPartOfSpeechToShort)
    .filter(Boolean);
  if (mapped.length === 0) return null;
  // stable order
  const order = ["n", "v", "adj", "adv", "prep", "conj", "pron", "det", "interj"];
  mapped.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return Array.from(new Set(mapped));
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function main() {
  return (async () => {
    const { input, output, dryRun, concurrency } = parseArgs(process.argv);
    const raw = fs.readFileSync(input, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.flashcards)) throw new Error("Input JSON missing flashcards[]");

    const cards = data.flashcards;
    const need = [];
    const cache = new Map();

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c || typeof c.word !== "string") continue;
      if (wordHasPosSuffix(c.word)) continue;
      const q = normalizeQueryWord(c.word);
      if (!q) continue;
      need.push({ idx: i, query: q, word: c.word });
    }

    const notFound = [];
    let updated = 0;

    await runPool(need, concurrency, async (item) => {
      if (cache.has(item.query)) return;
      const pos = await fetchPartsOfSpeech(item.query);
      cache.set(item.query, pos);
    });

    for (const item of need) {
      const pos = cache.get(item.query);
      if (!pos) {
        notFound.push(item.word);
        continue;
      }
      const suffix = ` (${pos.join("/")})`;
      const next = `${item.word}${suffix}`;
      if (next !== cards[item.idx].word) {
        cards[item.idx] = { ...cards[item.idx], word: next };
        updated++;
      }
    }

    const report = {
      input,
      output,
      totalFlashcards: cards.length,
      updated,
      lookedUp: need.length,
      notFoundCount: notFound.length,
      notFoundSample: notFound.slice(0, 30),
    };

    if (!dryRun) {
      ensureDir(output);
      fs.writeFileSync(output, JSON.stringify(data, null, 2) + "\n", "utf8");
    }

    console.log(JSON.stringify(report, null, 2));
  })();
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});

