#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join, relative, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ─${"─".repeat(Math.max(0, 60 - title.length - 4))}`);
}

// ── File existence ────────────────────────────────────────────────
section("File Existence");

const REQUIRED_FILES = [
  "index.html",
  "package.json",
  "README.md",
  "src/js/app.js",
  "src/js/bookmarks.js",
  "src/js/comments.js",
  "src/js/crypto.js",
  "src/js/diff.js",
  "src/js/editor-images.js",
  "src/js/editor-toolbar.js",
  "src/js/exporter.js",
  "src/js/feed-filters.js",
  "src/js/network.js",
  "src/js/parser.js",
  "src/js/pyodide-manager.js",
  "src/js/revisions.js",
  "src/js/roles.js",
  "src/js/router.js",
  "src/js/state.js",
  "src/js/tags.js",
  "src/js/theme.js",
  "src/js/toast.js",
  "src/js/utils.js",
  "src/js/voting.js",
  "src/js/worker/pyodide.worker.js",
  "src/views/post-detail.js",
  "src/views/profile.js",
  "src/views/my-lab.js",
  "src/css/styles.css",
  "src/css/base.css",
  "src/css/components.css",
  "src/css/print.css",
  "src/css/animations.css",
  "src/css/tokens/index.css",
  "src/css/tokens/primitives.css",
  "src/css/tokens/semantic.css",
  "src/css/tokens/components.css",
];

for (const f of REQUIRED_FILES) {
  const p = join(ROOT, f);
  const exists = f.endsWith("/") ? existsSync(p) && statSync(p).isDirectory() : existsSync(p) && statSync(p).isFile();
  check(`Exists: ${f}`, exists, exists ? "" : `Not found at ${p}`);
}

// ── JS Syntax ─────────────────────────────────────────────────────
section("JS Syntax");

const JS_FILES = [
  "src/js/app.js",
  "src/js/bookmarks.js",
  "src/js/comments.js",
  "src/js/crypto.js",
  "src/js/diff.js",
  "src/js/editor-images.js",
  "src/js/editor-toolbar.js",
  "src/js/exporter.js",
  "src/js/feed-filters.js",
  "src/js/network.js",
  "src/js/parser.js",
  "src/js/pyodide-manager.js",
  "src/js/revisions.js",
  "src/js/roles.js",
  "src/js/router.js",
  "src/js/state.js",
  "src/js/tags.js",
  "src/js/theme.js",
  "src/js/toast.js",
  "src/js/utils.js",
  "src/js/voting.js",
  "src/js/worker/pyodide.worker.js",
];

for (const f of JS_FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) {
    check(`Syntax: ${f}`, false, "File not found");
    continue;
  }
  const content = readFileSync(p, "utf-8");
  const tmpDir = mkdtempSync("/tmp/jscheck-");
  const tmpFile = join(tmpDir, "check.mjs");
  writeFileSync(tmpFile, content);
  try {
    execSync(`node --check "${tmpFile}"`, { stdio: "pipe" });
    check(`Syntax: ${f}`, true);
  } catch (e) {
    const stderr = e.stderr.toString().trim();
    check(`Syntax: ${f}`, false, stderr.split("\n").slice(-2).join(" "));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── No localStorage.clear() ───────────────────────────────────────
section("No bare localStorage.clear()");

const ALL_JS = [];
function collectJS(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      collectJS(p);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      ALL_JS.push(p);
    }
  }
}
collectJS(join(ROOT, "src"));

for (const p of ALL_JS) {
  const rel = relative(ROOT, p);
  const content = readFileSync(p, "utf-8");
  if (/localStorage\.clear\s*\(/.test(content)) {
    check(`No bare localStorage.clear(): ${rel}`, false, "Found localStorage.clear() call");
  }
}
check("All files scoped", true);

// ── No bare specifier imports (from 'x' without URL or global) ───
section("No bare specifier imports");

const ALLOWED_PREFIXES = ["https://", "http://", "./", "../", "/"];
const KNOWN_GLOBALS = ["nostr-tools", "marked", "dompurify", "katex"];

for (const p of ALL_JS) {
  const rel = relative(ROOT, p);
  const content = readFileSync(p, "utf-8");
  const importRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1];
    const isAllowed = ALLOWED_PREFIXES.some(prefix => specifier.startsWith(prefix));
    const isGlobal = KNOWN_GLOBALS.some(g => specifier.startsWith(g) && !specifier.includes("/"));
    if (!isAllowed && !isGlobal) {
      check(`Import check: ${rel}`, false, `Bare specifier "${specifier}" needs CDN URL or global`);
    }
  }
}
check("No bare specifier imports found", true);

// ── DOM ID cross-reference ────────────────────────────────────────
section("DOM ID cross-reference");

const html = readFileSync(join(ROOT, "index.html"), "utf-8");
const htmlIds = [...html.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);

const JS_PATTERNS = [
  /getElementById\s*\(\s*['"]([^'"]+)['"]/g,
  /querySelector\s*\(\s*['"]#([^'"\s)\]]+)/g,
];

const usedIds = new Set();
for (const p of ALL_JS) {
  const content = readFileSync(p, "utf-8");
  for (const regex of JS_PATTERNS) {
    let m;
    while ((m = regex.exec(content)) !== null) {
      usedIds.add(m[1]);
    }
  }
}

for (const id of usedIds) {
  const dynamicIds = ["app-root", "feed-container", "lab-experiments", "profile-page-container", "post-detail-container", "profile-user-posts", "post-replies", "post-comments-section", "btn-submit-comment", "comment-input", "comment-reply-info", "comment-preview", "btn-toggle-comment-preview", "post-revisions-timeline", "btn-prev-version", "btn-next-version", "btn-rollback", "diff-container", "btn-show-diff", "revision-compare-select", "lab-revisions", "commit-message-wrapper", "commit-message", "commit-counter", "btn-export-md", "btn-export-thread-md", "btn-print-post", "btn-bookmark-detail", "editor-attachments-panel", "editor-attachments", "editor-attachments-count", "editor-toolbar", "editor-counter", "btn-swap-layout", "draft-restore-banner", "btn-restore-draft", "btn-discard-draft", "editor-saved-status", "lab-bookmarks", "lab-bookmarks-list", "lab-bookmarks-info", "lab-bookmarks-count", "btn-publish-bookmarks", "feed-filters-toolbar", "feed-sort", "feed-time-range", "feed-only-bookmarks", "feed-hide-superseded", "btn-feed-reset-filters", "feed-result-count", "feed-empty-bookmarks-msg"];
  const exists = htmlIds.includes(id) || dynamicIds.includes(id);
  check(`DOM ID found: #${id}`, exists, exists ? "" : `#${id} referenced in JS but missing in index.html`);
}

// ── Event handler pattern check ───────────────────────────────────
section("Event handler patterns");

const appJs = readFileSync(join(ROOT, "src/js/app.js"), "utf-8");
check("Has hash router with showPage",
  /import.*initRouter.*from.*router/.test(appJs),
  "Router init missing"
);

check("Has onPageChange callback",
  /setOnPageChange/.test(appJs),
  "Page change callback missing"
);

check("Kind 0 handler populated",
  !/if\s*\(event\.kind\s*===\s*0\)\s*\{\s*\/\*\s*\.\.\.\s*l.gica\s*de\s*perfiles\s*\.\.\.\s*\*\//.test(appJs),
  "Kind 0 handler is still empty"
);

check("Publish button has loading guard",
  /btnPublish\.disabled/.test(appJs),
  "Publish button missing disabled/loading state"
);

check("Drag-drop overlay wired",
  /"dragover"/.test(appJs) && /"dragleave"/.test(appJs) && /"drop"/.test(appJs),
  "Drag-drop event listeners missing"
);

// ── Pyodide worker ────────────────────────────────────────────────
section("Pyodide worker safety");

const pyodideWorker = readFileSync(join(ROOT, "src/js/worker/pyodide.worker.js"), "utf-8");
check("No fragile template-escaping in pyodide worker",
  !new RegExp('\\.replace\\(\\/"""', 'g').test(pyodideWorker),
  "Still using fragile triple-quote escaping"
);
check("Uses globals.set for user code",
  /globals\.set\(/.test(pyodideWorker),
  "Missing pyodide.globals.set() for user code"
);
check("Cleans up user_code globals",
  (pyodideWorker.match(/__user_code__/g) || []).length >= 2,
  "Missing __user_code__ cleanup"
);

// ── Rendering targets ─────────────────────────────────────────────
section("Rendering targets");

check("Renders to feed-container",
  /getElementById\("feed-container"\)/.test(appJs),
  "Posts not rendered to feed-container"
);
check("Renders to lab-experiments for own posts",
  /getElementById\("lab-experiments"\)/.test(appJs),
  "Own posts not rendered to lab-experiments"
);
check("No rendering to old sharedFeed",
  !/getElementById\("sharedFeed"\)/.test(appJs),
  "Still rendering to removed sharedFeed"
);

// ── Web Worker path ───────────────────────────────────────────────
section("Web Worker path");

const pyodideManager = readFileSync(join(ROOT, "src/js/pyodide-manager.js"), "utf-8");
check("Worker path is relative",
  /new\s+Worker\s*\(\s*['"]\.\//.test(pyodideManager) || /new\s+Worker\s*\(\s*['"]\.\.\//.test(pyodideManager),
  "Worker path is absolute or uses wrong format"
);

// ── crypto.js ─────────────────────────────────────────────────────
section("crypto.js");

const cryptoJs = readFileSync(join(ROOT, "src/js/crypto.js"), "utf-8");
check("clearSession is scoped",
  /localStorage\.removeItem/.test(cryptoJs) && !/localStorage\.clear/.test(cryptoJs),
  "clearSession still uses localStorage.clear()"
);

// ── network.js ────────────────────────────────────────────────────
section("network.js");

const networkJs = readFileSync(join(ROOT, "src/js/network.js"), "utf-8");
check("Has onerror handler",
  /socket\.onerror/.test(networkJs),
  "WebSocket missing onerror handler"
);
check("No broad subscription in connect",
  !/kinds:\s*\[0,\s*1\]/.test(networkJs.split("connect()")[1]?.split("onopen")[1] || ""),
  "connect() still has broad { kinds: [0,1] } subscription"
);

// ── Sprint 1: score inheritance + cross-author amendments ────────
section("Sprint 1 — Score inheritance & forks");

const votingJs = readFileSync(join(ROOT, "src/js/voting.js"), "utf-8");
const commentsJs = readFileSync(join(ROOT, "src/js/comments.js"), "utf-8");
check("voting.js exports transferVotes",
  /export function transferVotes/.test(votingJs),
  "transferVotes() not exported from voting.js"
);
check("voting.js getReputation accepts supersededIds",
  /getReputation\s*\(\s*pubkey\s*,\s*eventCache\s*,\s*supersededIds/.test(votingJs),
  "getReputation signature missing supersededIds parameter"
);
check("app.js registerAmendment detects fork via _isFork",
  /_isFork\s*=\s*true/.test(appJs),
  "registerAmendment does not mark _isFork"
);
check("app.js registerAmendment calls transferVotes for same-author",
  /Voting\.transferVotes\s*\(\s*targetId\s*,\s*event\.id\s*\)/.test(appJs),
  "registerAmendment does not call transferVotes on same-author"
);
check("app.js render uses version-badge class",
  /version-badge/.test(appJs),
  "renderizarEvento missing version-badge class"
);
check("app.js render uses fork-badge class",
  /fork-badge/.test(appJs),
  "renderizarEvento missing fork-badge class"
);
check("app.js cargarDesdeCache does 3 passes",
  (appJs.match(/for \(const event of cache\)/g) || []).length >= 3,
  "cargarDesdeCache should iterate cache at least 3 times (populate, build chain, render)"
);
check("app.js stores amendmentNext in State",
  /State\.set\(['"]amendmentNext['"]/.test(appJs),
  "amendmentNext not stored in State for cross-module use"
);

const postDetailJs = readFileSync(join(ROOT, "src/views/post-detail.js"), "utf-8");
check("post-detail uses fork-badge",
  /fork-badge/.test(postDetailJs),
  "post-detail.js missing fork-badge usage"
);
check("post-detail uses version-badge",
  /version-badge/.test(postDetailJs),
  "post-detail.js missing version-badge usage"
);
check("post-detail has getVersionChain helper",
  /function getVersionChain/.test(postDetailJs),
  "post-detail.js missing getVersionChain helper"
);

const stylesCss = readFileSync(join(ROOT, "src/css/styles.css"), "utf-8");
const componentsCss = readFileSync(join(ROOT, "src/css/components.css"), "utf-8");
const baseCss = readFileSync(join(ROOT, "src/css/base.css"), "utf-8");
const tokensIndexCss = readFileSync(join(ROOT, "src/css/tokens/index.css"), "utf-8");
const primitivesCss = readFileSync(join(ROOT, "src/css/tokens/primitives.css"), "utf-8");
const semanticCss = readFileSync(join(ROOT, "src/css/tokens/semantic.css"), "utf-8");
const tokensComponentsCss = readFileSync(join(ROOT, "src/css/tokens/components.css"), "utf-8");
const printCss = readFileSync(join(ROOT, "src/css/print.css"), "utf-8");
const animationsCss = readFileSync(join(ROOT, "src/css/animations.css"), "utf-8");
check("components.css has .fork-badge rule",
  /\.fork-badge\s*\{/.test(componentsCss),
  "components.css missing .fork-badge rule"
);
check("components.css has .version-badge rule",
  /\.version-badge\s*\{/.test(componentsCss),
  "components.css missing .version-badge rule"
);

check("network.js exposes fetchEventById",
  /fetchEventById\s*\(/.test(networkJs),
  "network.js missing fetchEventById method"
);
check("app.js calls fetchEventById on fork with missing target",
  /fetchEventById\s*\(\s*targetId\s*\)/.test(appJs),
  "app.js fork branch does not call fetchEventById for missing target"
);

// ── Sprint 2: Search over relay (NIP-50) ────────────────────────
section("Sprint 2 — Relay search (NIP-50)");

check("network.js exposes searchEvents",
  /searchEvents\s*\(/.test(networkJs),
  "network.js missing searchEvents method"
);
check("network.js searchEvents sends NIP-50 search filter",
  /search:\s*q/.test(networkJs) || /search:\s*query/.test(networkJs) || /search:\s*cleanTerm/.test(networkJs) || /"search":\s*\w+/.test(networkJs),
  "searchEvents does not include a search filter in the REQ"
);
check("network.js exposes closeSubscription",
  /closeSubscription\s*\(/.test(networkJs) && /\[\s*"CLOSE"\s*,\s*subId\s*\]/.test(networkJs),
  "network.js missing closeSubscription or CLOSE message"
);
check("app.js search input has debounce timer",
  /searchDebounceTimer/.test(appJs) && /setTimeout/.test(appJs),
  "app.js search input not debounced"
);
check("app.js search calls network.searchEvents",
  /network\.searchEvents\s*\(/.test(appJs),
  "app.js search does not call network.searchEvents"
);
check("app.js search closes previous subscription on new query",
  /closeSubscription\s*\(\s*activeSearchSubId\s*\)/.test(appJs),
  "app.js does not close previous search subscription"
);

// ── Sprint 5: Revisions v2 (Kind 30211) ─────────────────────
section("Sprint 5 — Revisions v2 (Kind 30211)");

const revisionsJs = readFileSync(join(ROOT, "src/js/revisions.js"), "utf-8");
check("revisions.js exposes REVISION_KIND 30211",
  /export const REVISION_KIND\s*=\s*30211/.test(revisionsJs),
  "revisions.js missing REVISION_KIND = 30211"
);
check("revisions.js exports chains",
  /export const chains\s*=/.test(revisionsJs),
  "revisions.js missing chains export"
);
check("revisions.js exports registerEvent",
  /export function registerEvent/.test(revisionsJs),
  "revisions.js missing registerEvent"
);
check("revisions.js exports recomputeCanonical",
  /export function recomputeCanonical/.test(revisionsJs),
  "revisions.js missing recomputeCanonical"
);
check("revisions.js exports buildRevisionTags",
  /export function buildRevisionTags/.test(revisionsJs),
  "revisions.js missing buildRevisionTags"
);
check("revisions.js detects revision event by e+revision tag",
  /\[\"e\",\s*\w+,\s*\"\",\s*\"revision\"\]/.test(revisionsJs) || /['"]revision['"]/.test(revisionsJs),
  "revisions.js missing detection of e+revision tag"
);
check("revisions.js uses Voting.getScore in recomputeCanonical",
  /Voting\.getScore/.test(revisionsJs),
  "revisions.js does not use Voting.getScore in canonical recompute"
);
check("revisions.js has countPromotedForksByAuthor",
  /countPromotedForksByAuthor/.test(revisionsJs),
  "revisions.js missing countPromotedForksByAuthor"
);

const diffJs = readFileSync(join(ROOT, "src/js/diff.js"), "utf-8");
check("diff.js exports diffLines",
  /export function diffLines/.test(diffJs),
  "diff.js missing diffLines"
);
check("diff.js exports renderDiffHTML",
  /export function renderDiffHTML/.test(diffJs),
  "diff.js missing renderDiffHTML"
);
check("diff.js exports summarizeDiff",
  /export function summarizeDiff/.test(diffJs),
  "diff.js missing summarizeDiff"
);

check("app.js imports revisions module",
  /import \* as Revisions from '\.\/revisions\.js'/.test(appJs),
  "app.js missing revisions import"
);
check("diff module is imported by a view",
  /from ['"]\.\.\/js\/diff\.js['"]/.test(postDetailJs) || /from ['"]\.\.\/\.\.\/js\/diff\.js['"]/.test(postDetailJs),
  "diff.js not imported by post-detail.js"
);
check("app.js handles Kind 30211 in network event handler",
  /event\.kind\s*===\s*30211/.test(appJs),
  "app.js missing handler for Kind 30211 events"
);
check("app.js validates commit-message for revisions",
  /commitMsg|commit-message|commitInput/.test(appJs) && /\.trim\(\)/.test(appJs),
  "app.js missing commit message validation"
);
check("app.js publishes revisions as Kind 30211",
  /kind\s*=\s*Revisions\.REVISION_KIND|REVISION_KIND/.test(appJs),
  "app.js does not use Revisions.REVISION_KIND for publishing"
);
check("app.js does not expose chains on window (post-refactor)",
  !/window\.__chains/.test(appJs),
  "app.js still exposes __chains on window"
);
check("app.js recomputes canonical on vote",
  /Revisions\.recomputeCanonical/.test(appJs),
  "app.js missing Revisions.recomputeCanonical call"
);
check("app.js has syncCardForRoot function",
  /function syncCardForRoot/.test(appJs),
  "app.js missing syncCardForRoot"
);
check("app.js uses revision-badges / canonical-card classes",
  /revision-badges|canonical-card/.test(appJs),
  "app.js missing revision-badges or canonical-card references"
);

check("post-detail.js imports revisions and diff",
  /Revisions/.test(postDetailJs) && /diffLines|renderDiffHTML/.test(postDetailJs),
  "post-detail.js missing revisions or diff imports"
);
check("post-detail.js renders revision nav (prev/next)",
  /btn-prev-version/.test(postDetailJs) && /btn-next-version/.test(postDetailJs),
  "post-detail.js missing revision navigation"
);
check("post-detail.js renders diff container",
  /diff-container|diff-render/.test(postDetailJs),
  "post-detail.js missing diff container"
);
check("post-detail.js has renderTimelineSection",
  /function renderTimelineSection|renderTimelineSection/.test(postDetailJs),
  "post-detail.js missing renderTimelineSection"
);
check("post-detail.js detects revisionTag and Kind 30211",
  /['"]revision['"]/.test(postDetailJs) && /30211/.test(postDetailJs),
  "post-detail.js missing revision tag or Kind 30211 detection"
);

check("index.html has data-labtab=\"revisions\"",
  /data-labtab="revisions"/.test(html),
  "index.html missing revisions lab tab"
);
check("index.html has #lab-revisions container",
  /id="lab-revisions"/.test(html),
  "index.html missing #lab-revisions container"
);
check("index.html has commit-message-wrapper",
  /id="commit-message-wrapper"/.test(html) && /id="commit-message"/.test(html),
  "index.html missing commit-message UI"
);

check("network.js subscribes to Kind 30211",
  /kinds:\s*\[30211\]/.test(networkJs),
  "network.js missing Kind 30211 subscription"
);

check("components.css has .timeline-item-dot rule",
  /\.timeline-item-dot\s*\{/.test(componentsCss),
  "components.css missing .timeline-item-dot"
);
check("components.css has .diff-line-add rule",
  /\.diff-line-add\s*\{/.test(componentsCss),
  "components.css missing .diff-line-add"
);
check("components.css has .canonical-card rule",
  /\.canonical-card\s*\{/.test(componentsCss),
  "components.css missing .canonical-card"
);
check("components.css has .expandable-panel rule",
  /\.expandable-panel\s*\{/.test(componentsCss),
  "components.css missing .expandable-panel"
);
check("components.css has .promoted-badge rule",
  /\.promoted-badge\s*\{/.test(componentsCss),
  "components.css missing .promoted-badge"
);

const myLabJs = readFileSync(join(ROOT, "src/views/my-lab.js"), "utf-8");
const profileJs = readFileSync(join(ROOT, "src/views/profile.js"), "utf-8");
check("my-lab.js exports renderRevisionsTab",
  /export function renderRevisionsTab/.test(myLabJs),
  "my-lab.js missing renderRevisionsTab export"
);
check("my-lab.js renders CANÓNICA / PROMOVIDO labels",
  /CANÓNICA|PROMOVIDO/.test(myLabJs),
  "my-lab.js missing CANONICA / PROMOVIDO labels"
);

// ── Sprint 6: Editor images (stubs + compression) ─────────────────
section("Sprint 6 — Editor images (stubs + compression)");

const editorImagesJs = readFileSync(join(ROOT, "src/js/editor-images.js"), "utf-8");
check("editor-images.js exports attachImage",
  /export async function attachImage|export function attachImage/.test(editorImagesJs),
  "editor-images.js missing attachImage export"
);
check("editor-images.js exports compressImage",
  /export function compressImage/.test(editorImagesJs),
  "editor-images.js missing compressImage export"
);
check("editor-images.js exports buildStub",
  /export function buildStub/.test(editorImagesJs),
  "editor-images.js missing buildStub export"
);
check("editor-images.js exports expandStubs",
  /export function expandStubs/.test(editorImagesJs),
  "editor-images.js missing expandStubs export"
);
check("editor-images.js exports extractStubIds",
  /export function extractStubIds/.test(editorImagesJs),
  "editor-images.js missing extractStubIds export"
);
check("editor-images.js exports removeImage",
  /export function removeImage/.test(editorImagesJs),
  "editor-images.js missing removeImage export"
);
check("editor-images.js exports clearAll",
  /export function clearAll/.test(editorImagesJs),
  "editor-images.js missing clearAll export"
);
check("editor-images.js uses STORAGE_KEY sciln_pending_images",
  /sciln_pending_images/.test(editorImagesJs),
  "editor-images.js missing sciln_pending_images storage key"
);
check("editor-images.js has MAX_FILE_BYTES guard",
  /MAX_FILE_BYTES/.test(editorImagesJs),
  "editor-images.js missing MAX_FILE_BYTES guard"
);
check("editor-images.js buildStub includes stub prefix [imagen:",
  /\[imagen:/.test(editorImagesJs),
  "editor-images.js missing [imagen: stub format"
);
check("editor-images.js exports loadImagesFromContent",
  /export function loadImagesFromContent/.test(editorImagesJs),
  "editor-images.js missing loadImagesFromContent export"
);
check("editor-images.js loadImagesFromContent extracts data: URLs from markdown",
  /data:image\\\/\[a-zA-Z0-9\+\.-\]\+;base64/.test(editorImagesJs) || /data:image\/[a-zA-Z0-9+.-]+;base64/.test(editorImagesJs),
  "editor-images.js loadImagesFromContent regex missing"
);

check("app.js imports EditorImages module",
  /import \* as EditorImages from '\.\/editor-images\.js'/.test(appJs),
  "app.js missing EditorImages import"
);
check("app.js calls EditorImages.attachImage on paste/drop",
  /EditorImages\.attachImage\s*\(/.test(appJs),
  "app.js not calling EditorImages.attachImage"
);
check("app.js calls EditorImages.expandStubs on publish",
  /EditorImages\.expandStubs\s*\(\s*editor\.value\s*\)/.test(appJs),
  "app.js publish handler missing expandStubs call"
);
check("app.js has renderAttachmentsPanel function",
  /function renderAttachmentsPanel/.test(appJs),
  "app.js missing renderAttachmentsPanel"
);
check("app.js handles image files via handleImageFiles",
  /async function handleImageFiles|function handleImageFiles/.test(appJs),
  "app.js missing handleImageFiles"
);
check("app.js amendment prefill uses loadImagesFromContent",
  /EditorImages\.loadImagesFromContent\s*\(\s*ad\.content\s*\)/.test(appJs),
  "app.js amendment prefill not using loadImagesFromContent"
);
check("app.js amendment prefill calls renderAttachmentsPanel",
  /State\.get\(['"]amendmentData['"][\s\S]{0,800}renderAttachmentsPanel/.test(appJs),
  "app.js amendment prefill not refreshing attachments panel"
);

check("index.html has #editor-attachments panel",
  /id="editor-attachments-panel"/.test(html),
  "index.html missing #editor-attachments-panel"
);
check("index.html has #editor-attachments container",
  /id="editor-attachments"/.test(html),
  "index.html missing #editor-attachments container"
);
check("index.html has #btn-clear-attachments button",
  /id="btn-clear-attachments"/.test(html),
  "index.html missing #btn-clear-attachments button"
);
check("index.html has #editor-attachments-count counter",
  /id="editor-attachments-count"/.test(html),
  "index.html missing #editor-attachments-count"

);
check("components.css has .editor-attachment-thumb rule",
  /\.editor-attachment-thumb\s*\{/.test(componentsCss),
  "components.css missing .editor-attachment-thumb"
);
check("components.css has .editor-attachment-remove rule",
  /\.editor-attachment-remove\s*\{/.test(componentsCss),
  "components.css missing .editor-attachment-remove"
);

// ── Sprint 7: Editor toolbar / atajos / autosave ─────────────────
section("Sprint 7 — Editor toolbar & UX");

const editorToolbarJs = readFileSync(join(ROOT, "src/js/editor-toolbar.js"), "utf-8");
check("editor-toolbar.js exports applyAction",
  /export function applyAction/.test(editorToolbarJs),
  "editor-toolbar.js missing applyAction export"
);
check("editor-toolbar.js exports handleKeydown",
  /export function handleKeydown/.test(editorToolbarJs),
  "editor-toolbar.js missing handleKeydown export"
);
check("editor-toolbar.js exports startAutosave",
  /export function startAutosave/.test(editorToolbarJs),
  "editor-toolbar.js missing startAutosave export"
);
check("editor-toolbar.js exports saveDraft",
  /export function saveDraft/.test(editorToolbarJs),
  "editor-toolbar.js missing saveDraft export"
);
check("editor-toolbar.js exports loadDraft",
  /export function loadDraft/.test(editorToolbarJs),
  "editor-toolbar.js missing loadDraft export"
);
check("editor-toolbar.js exports clearDraft",
  /export function clearDraft/.test(editorToolbarJs),
  "editor-toolbar.js missing clearDraft export"
);
check("editor-toolbar.js exports countWords",
  /export function countWords/.test(editorToolbarJs),
  "editor-toolbar.js missing countWords export"
);
check("editor-toolbar.js uses sciln_editor_draft key",
  /sciln_editor_draft/.test(editorToolbarJs),
  "editor-toolbar.js missing sciln_editor_draft storage key"
);
check("editor-toolbar.js handles Ctrl+B / Ctrl+I / Ctrl+K",
  /key === 'b'/.test(editorToolbarJs) && /key === 'i'/.test(editorToolbarJs) && /key === 'k'/.test(editorToolbarJs),
  "editor-toolbar.js missing Ctrl+B / Ctrl+I / Ctrl+K shortcuts"
);
check("editor-toolbar.js handles Ctrl+Enter for publish",
  /key === 'Enter'/.test(editorToolbarJs) && /sciln:publish-request/.test(editorToolbarJs),
  "editor-toolbar.js missing Ctrl+Enter publish trigger"
);
check("editor-toolbar.js handles Tab indent",
  /e\.key === 'Tab'/.test(editorToolbarJs),
  "editor-toolbar.js missing Tab indent handling"
);

check("app.js imports EditorToolbar module",
  /import \* as EditorToolbar from '\.\/editor-toolbar\.js'/.test(appJs),
  "app.js missing EditorToolbar import"
);
check("app.js wires editor-toolbar click handler",
  /editor-toolbar[\s\S]{0,300}data-action/.test(appJs),
  "app.js missing editor-toolbar click handler"
);
check("app.js uses EditorToolbar.startAutosave",
  /EditorToolbar\.startAutosave/.test(appJs),
  "app.js missing EditorToolbar.startAutosave call"
);
check("app.js uses EditorToolbar.clearDraft on publish",
  /EditorToolbar\.clearDraft/.test(appJs),
  "app.js missing EditorToolbar.clearDraft on publish"
);
check("app.js has updateEditorCounter function",
  /function updateEditorCounter/.test(appJs),
  "app.js missing updateEditorCounter"
);
check("app.js amendment prefill calls updateEditorCounter",
  /State\.get\(['"]amendmentData['"][\s\S]{0,800}updateEditorCounter/.test(appJs),
  "app.js amendment prefill not refreshing counter"
);

check("index.html has #editor-toolbar",
  /id="editor-toolbar"/.test(html),
  "index.html missing #editor-toolbar"
);
check("index.html has data-action buttons in toolbar",
  (html.match(/data-action="(bold|italic|code|link)"/g) || []).length >= 4,
  "index.html toolbar missing main action buttons"
);
check("index.html has #editor-counter",
  /id="editor-counter"/.test(html),
  "index.html missing #editor-counter"
);
check("index.html has #btn-swap-layout",
  /id="btn-swap-layout"/.test(html),
  "index.html missing #btn-swap-layout"
);
check("index.html has #draft-restore-banner",
  /id="draft-restore-banner"/.test(html),
  "index.html missing #draft-restore-banner"
);
check("index.html has #btn-restore-draft",
  /id="btn-restore-draft"/.test(html),
  "index.html missing #btn-restore-draft"
);
check("index.html has #btn-discard-draft",
  /id="btn-discard-draft"/.test(html),
  "index.html missing #btn-discard-draft"
);

check("components.css has .editor-toolbar-btn rule",
  /\.editor-toolbar-btn\s*\{/.test(componentsCss),
  "components.css missing .editor-toolbar-btn"
);
check("components.css has .editor-toolbar-sep rule",
  /\.editor-toolbar-sep\s*\{/.test(componentsCss),
  "components.css missing .editor-toolbar-sep"
);
check("components.css has .editor-swap-layout rule",
  /editor-swap-layout/.test(componentsCss),
  "components.css missing .editor-swap-layout"
);

// ── Sprint 8: Bookmarks (Kind 10003 NIP-51) ──────────────────────
section("Sprint 8 — Bookmarks (Kind 10003 NIP-51)");

const bookmarksJs = readFileSync(join(ROOT, "src/js/bookmarks.js"), "utf-8");
check("bookmarks.js exports BOOKMARK_KIND 10003",
  /export const BOOKMARK_KIND\s*=\s*10003/.test(bookmarksJs),
  "bookmarks.js missing BOOKMARK_KIND = 10003"
);
check("bookmarks.js exports isBookmarked",
  /export function isBookmarked/.test(bookmarksJs),
  "bookmarks.js missing isBookmarked"
);
check("bookmarks.js exports add",
  /export async function add|export function add/.test(bookmarksJs),
  "bookmarks.js missing add"
);
check("bookmarks.js exports remove",
  /export async function remove|export function remove/.test(bookmarksJs),
  "bookmarks.js missing remove"
);
check("bookmarks.js exports toggle",
  /export async function toggle|export function toggle/.test(bookmarksJs),
  "bookmarks.js missing toggle"
);
check("bookmarks.js exports list",
  /export function list/.test(bookmarksJs),
  "bookmarks.js missing list"
);
check("bookmarks.js exports count",
  /export function count/.test(bookmarksJs),
  "bookmarks.js missing count"
);
check("bookmarks.js exports subscribe",
  /export function subscribe/.test(bookmarksJs),
  "bookmarks.js missing subscribe"
);
check("bookmarks.js exports mergeFromEvent",
  /export function mergeFromEvent/.test(bookmarksJs),
  "bookmarks.js missing mergeFromEvent"
);
check("bookmarks.js exports publishToRelay",
  /export async function publishToRelay|export function publishToRelay/.test(bookmarksJs),
  "bookmarks.js missing publishToRelay"
);
check("bookmarks.js uses sciln_bookmarks storage key",
  /sciln_bookmarks/.test(bookmarksJs),
  "bookmarks.js missing sciln_bookmarks storage key"
);
check("bookmarks.js uses 'd' tag for replaceable list",
  /\['d',\s*['"]bookmarks['"]\]/.test(bookmarksJs),
  "bookmarks.js missing 'd' tag (NIP-51 identifier)"
);
check("bookmarks.js parses 'e' tags from incoming event",
  /tag\[0\]\s*===\s*['"]e['"]/.test(bookmarksJs),
  "bookmarks.js not parsing 'e' tags from incoming events"
);

check("network.js exposes fetchBookmarks",
  /fetchBookmarks\s*\(/.test(networkJs),
  "network.js missing fetchBookmarks method"
);
check("network.js fetchBookmarks requests Kind 10003",
  /kinds:\s*\[10003\]/.test(networkJs),
  "network.js fetchBookmarks not requesting Kind 10003"
);

check("app.js imports Bookmarks module",
  /import \* as Bookmarks from '\.\/bookmarks\.js'/.test(appJs),
  "app.js missing Bookmarks import"
);
check("app.js wires bookmark click handler",
  /\[data-action="bookmark"\]/.test(appJs) || /data-action=\"bookmark\"/.test(appJs),
  "app.js missing bookmark click handler"
);
check("app.js handles incoming Kind 10003 events",
  /event\.kind\s*===\s*Bookmarks\.BOOKMARK_KIND|event\.kind\s*===\s*10003/.test(appJs),
  "app.js missing Kind 10003 event handler"
);
check("app.js does not expose Bookmarks on window (post-refactor)",
  !/window\.__bookmarks/.test(appJs),
  "app.js still exposes __bookmarks on window"
);
check("app.js subscribes to bookmark changes",
  /Bookmarks\.subscribe/.test(appJs),
  "app.js not subscribing to bookmark changes"
);
check("app.js subscribes to State.session for fetchBookmarks",
  /State\.subscribe\(['"]session['"][\s\S]{0,200}fetchBookmarks/.test(appJs),
  "app.js not calling fetchBookmarks from session subscriber"
);

check("index.html has data-labtab=\"bookmarks\"",
  /data-labtab="bookmarks"/.test(html),
  "index.html missing bookmarks lab tab"
);
check("index.html has #lab-bookmarks container",
  /id="lab-bookmarks"/.test(html),
  "index.html missing #lab-bookmarks container"
);
check("index.html has #lab-bookmarks-list",
  /id="lab-bookmarks-list"/.test(html),
  "index.html missing #lab-bookmarks-list"
);
check("index.html has #lab-bookmarks-count",
  /id="lab-bookmarks-count"/.test(html),
  "index.html missing #lab-bookmarks-count"
);
check("index.html has #btn-publish-bookmarks",
  /id="btn-publish-bookmarks"/.test(html),
  "index.html missing #btn-publish-bookmarks"
);

check("my-lab.js imports Bookmarks module",
  /import \* as Bookmarks from '\.\.\/js\/bookmarks\.js'/.test(myLabJs),
  "my-lab.js missing Bookmarks import"
);
check("my-lab.js exports renderBookmarksTab",
  /export function renderBookmarksTab/.test(myLabJs),
  "my-lab.js missing renderBookmarksTab export"
);
check("my-lab.js handles bookmarks tab click",
  /target === 'bookmarks'/.test(myLabJs),
  "my-lab.js not handling bookmarks tab click"
);

check("profile.js imports Bookmarks module",
  /import \* as Bookmarks from '\.\.\/js\/bookmarks\.js'/.test(profileJs),
  "profile.js missing Bookmarks import"
);
check("profile.js renders bookmark count",
  /Bookmarks\.count/.test(profileJs),
  "profile.js not rendering bookmark count"
);

// ── Sprint 9: Export to Markdown / PDF ────────────────────────────
section("Sprint 9 — Export to Markdown / PDF");

const exporterJs = readFileSync(join(ROOT, "src/js/exporter.js"), "utf-8");
check("exporter.js exports toStandaloneMarkdown",
  /export function toStandaloneMarkdown/.test(exporterJs),
  "exporter.js missing toStandaloneMarkdown"
);
check("exporter.js exports toThreadMarkdown",
  /export function toThreadMarkdown/.test(exporterJs),
  "exporter.js missing toThreadMarkdown"
);
check("exporter.js exports downloadMarkdown",
  /export function downloadMarkdown/.test(exporterJs),
  "exporter.js missing downloadMarkdown"
);
check("exporter.js exports downloadPostMarkdown",
  /export function downloadPostMarkdown/.test(exporterJs),
  "exporter.js missing downloadPostMarkdown"
);
check("exporter.js exports downloadThreadMarkdown",
  /export function downloadThreadMarkdown/.test(exporterJs),
  "exporter.js missing downloadThreadMarkdown"
);
check("exporter.js exports printElement",
  /export function printElement/.test(exporterJs),
  "exporter.js missing printElement"
);
check("exporter.js produces YAML frontmatter",
  /title:\s*"/.test(exporterJs) && /author:\s*"/.test(exporterJs) && /date:/.test(exporterJs),
  "exporter.js missing YAML frontmatter"
);
check("exporter.js uses Blob for download",
  /new Blob\(/.test(exporterJs),
  "exporter.js not using Blob for download"
);
check("exporter.js calls window.print for PDF",
  /window\.print\(\)/.test(exporterJs),
  "exporter.js not using window.print()"
);
check("exporter.js creates .print-area wrapper",
  /classList\.add\(['"]print-area['"]\)/.test(exporterJs) || /classList\.add\(\s*['"]print-area['"]/.test(exporterJs),
  "exporter.js not adding print-area class"
);

check("post-detail.js imports Exporter module",
  /import \* as Exporter from ['"]\.\.\/js\/exporter\.js['"]/.test(postDetailJs),
  "post-detail.js missing Exporter import"
);
check("post-detail.js has export-md button handler",
  /btn-export-md/.test(postDetailJs),
  "post-detail.js missing export-md button"
);
check("post-detail.js has export-thread-md button handler",
  /btn-export-thread-md/.test(postDetailJs),
  "post-detail.js missing export-thread-md button"
);
check("post-detail.js has print-post button handler",
  /btn-print-post/.test(postDetailJs),
  "post-detail.js missing print-post button"
);
check("post-detail.js calls Exporter.downloadPostMarkdown",
  /Exporter\.downloadPostMarkdown/.test(postDetailJs),
  "post-detail.js not calling Exporter.downloadPostMarkdown"
);
check("post-detail.js calls Exporter.printElement",
  /Exporter\.printElement/.test(postDetailJs),
  "post-detail.js not calling Exporter.printElement"
);

check("print.css has @media print rule",
  /@media print/.test(printCss),
  "print.css missing @media print"
);
check("print.css hides body when printing except print-area",
  /body\s*\*\s*\{\s*visibility:\s*hidden/.test(printCss),
  "print.css @media print not hiding body"
);
check("print.css has .print-area rule",
  /\.print-area\s*\{/.test(printCss),
  "print.css missing .print-area rule"
);

// ── Sprint 10: Feed filters (sort / time / toggles) ───────────────
section("Sprint 10 — Feed filters (sort / time / toggles)");

const feedFiltersJs = readFileSync(join(ROOT, "src/js/feed-filters.js"), "utf-8");
check("feed-filters.js exports getState",
  /export function getState/.test(feedFiltersJs),
  "feed-filters.js missing getState"
);
check("feed-filters.js exports setSort",
  /export function setSort/.test(feedFiltersJs),
  "feed-filters.js missing setSort"
);
check("feed-filters.js exports setTimeRange",
  /export function setTimeRange/.test(feedFiltersJs),
  "feed-filters.js missing setTimeRange"
);
check("feed-filters.js exports setOnlyBookmarks",
  /export function setOnlyBookmarks/.test(feedFiltersJs),
  "feed-filters.js missing setOnlyBookmarks"
);
check("feed-filters.js exports setHideSuperseded",
  /export function setHideSuperseded/.test(feedFiltersJs),
  "feed-filters.js missing setHideSuperseded"
);
check("feed-filters.js exports subscribe",
  /export function subscribe/.test(feedFiltersJs),
  "feed-filters.js missing subscribe"
);
check("feed-filters.js exports reset",
  /export function reset/.test(feedFiltersJs),
  "feed-filters.js missing reset"
);
check("feed-filters.js exports setBookmarkedChecker",
  /export function setBookmarkedChecker/.test(feedFiltersJs),
  "feed-filters.js missing setBookmarkedChecker"
);
check("feed-filters.js exports setSupersededChecker",
  /export function setSupersededChecker/.test(feedFiltersJs),
  "feed-filters.js missing setSupersededChecker"
);
check("feed-filters.js uses sciln_feed_filters key",
  /sciln_feed_filters/.test(feedFiltersJs),
  "feed-filters.js missing sciln_feed_filters storage key"
);
check("feed-filters.js has 5 sort options",
  (feedFiltersJs.match(/label:\s*['"][^'"]*['"]/g) || []).length >= 5,
  "feed-filters.js should have 5 sort options"
);
check("feed-filters.js has 5 time ranges",
  /'24h'/.test(feedFiltersJs) && /'7d'/.test(feedFiltersJs) && /'30d'/.test(feedFiltersJs) && /'90d'/.test(feedFiltersJs) && /'all'/.test(feedFiltersJs),
  "feed-filters.js missing time range keys"
);
check("feed-filters.js applies filter to posts",
  /export function applyToPosts/.test(feedFiltersJs),
  "feed-filters.js missing applyToPosts"
);

check("app.js imports FeedFilters module",
  /import \* as FeedFilters from '\.\/feed-filters\.js'/.test(appJs),
  "app.js missing FeedFilters import"
);
check("app.js wires feed-sort change handler",
  /feed-sort[\s\S]{0,200}addEventListener/.test(appJs),
  "app.js missing feed-sort listener"
);
check("app.js wires feed-time-range change handler",
  /feed-time-range[\s\S]{0,200}addEventListener/.test(appJs),
  "app.js missing feed-time-range listener"
);
check("app.js wires feed-only-bookmarks change handler",
  /feed-only-bookmarks[\s\S]{0,200}addEventListener/.test(appJs),
  "app.js missing feed-only-bookmarks listener"
);
check("app.js wires feed-hide-superseded change handler",
  /feed-hide-superseded[\s\S]{0,200}addEventListener/.test(appJs),
  "app.js missing feed-hide-superseded listener"
);
check("app.js wires reset filters button",
  /btn-feed-reset-filters[\s\S]{0,200}addEventListener/.test(appJs),
  "app.js missing reset filters button listener"
);
check("app.js sets Bookmarks checker on FeedFilters",
  /FeedFilters\.setBookmarkedChecker\(\s*Bookmarks\.isBookmarked/.test(appJs),
  "app.js not setting bookmarked checker"
);
check("app.js uses FeedFilters.matchesTimeRange",
  /FeedFilters\.matchesTimeRange/.test(appJs),
  "app.js not using matchesTimeRange"
);
check("app.js uses FeedFilters.matchesOnlyBookmarks",
  /FeedFilters\.matchesOnlyBookmarks/.test(appJs),
  "app.js not using matchesOnlyBookmarks"
);
check("app.js uses FeedFilters.matchesHideSuperseded",
  /FeedFilters\.matchesHideSuperseded/.test(appJs),
  "app.js not using matchesHideSuperseded"
);
check("app.js has syncFeedFilterUI function",
  /function syncFeedFilterUI/.test(appJs),
  "app.js missing syncFeedFilterUI"
);
check("app.js sets data-score on cards",
  /dataset\.score\s*=/.test(appJs),
  "app.js not setting data-score on cards"
);
check("app.js sets data-commentCount on cards",
  /dataset\.commentCount\s*=/.test(appJs),
  "app.js not setting data-commentCount on cards"
);
check("app.js sets data-forkCount on cards",
  /dataset\.forkCount\s*=/.test(appJs),
  "app.js not setting data-forkCount on cards"
);

check("index.html has #feed-filters-toolbar",
  /id="feed-filters-toolbar"/.test(html),
  "index.html missing #feed-filters-toolbar"
);
check("index.html has #feed-sort with 5 options",
  (html.match(/<option value="(recent|top|discussed|forked|alpha)"/g) || []).length === 5,
  "index.html #feed-sort should have 5 options"
);
check("index.html has #feed-time-range with 5 options",
  (html.match(/<option value="(24h|7d|30d|90d|all)"/g) || []).length === 5,
  "index.html #feed-time-range should have 5 options"
);
check("index.html has #feed-only-bookmarks checkbox",
  /id="feed-only-bookmarks"/.test(html),
  "index.html missing #feed-only-bookmarks"
);
check("index.html has #feed-hide-superseded checkbox",
  /id="feed-hide-superseded"/.test(html),
  "index.html missing #feed-hide-superseded"
);
check("index.html has #feed-result-count",
  /id="feed-result-count"/.test(html),
  "index.html missing #feed-result-count"
);
check("index.html has #feed-empty-bookmarks-msg",
  /id="feed-empty-bookmarks-msg"/.test(html),
  "index.html missing #feed-empty-bookmarks-msg"
);

check("post-detail.js has #btn-bookmark-detail",
  /id="btn-bookmark-detail"/.test(postDetailJs),
  "post-detail.js missing #btn-bookmark-detail"
);
check("post-detail.js imports Bookmarks module",
  /import \* as Bookmarks from ['"]\.\.\/js\/bookmarks\.js['"]/.test(postDetailJs),
  "post-detail.js missing Bookmarks import"
);
check("post-detail.js wires bookmark button click handler",
  /btn-bookmark-detail[\s\S]{0,300}addEventListener/.test(postDetailJs),
  "post-detail.js missing #btn-bookmark-detail click handler"
);
check("post-detail.js bookmark button calls Bookmarks.toggle",
  /Bookmarks\.toggle/.test(postDetailJs),
  "post-detail.js bookmark button not calling Bookmarks.toggle"
);
check("index.html has #btn-feed-reset-filters",
  /id="btn-feed-reset-filters"/.test(html),
  "index.html missing #btn-feed-reset-filters"
);

// ── Sprint 11: Refactor — state.js, utils.js, CSS modules, no window.__ ──
section("Sprint 11 — Refactor (state / utils / css modules / no window.__)");

const routerJs = readFileSync(join(ROOT, "src/js/router.js"), "utf-8");
const themeJs = readFileSync(join(ROOT, "src/js/theme.js"), "utf-8");
const toastJs = readFileSync(join(ROOT, "src/js/toast.js"), "utf-8");
const rolesJs = readFileSync(join(ROOT, "src/js/roles.js"), "utf-8");
const tagsJs = readFileSync(join(ROOT, "src/js/tags.js"), "utf-8");
const parserJs = readFileSync(join(ROOT, "src/js/parser.js"), "utf-8");

const stateJs = readFileSync(join(ROOT, "src/js/state.js"), "utf-8");
const utilsJs = readFileSync(join(ROOT, "src/js/utils.js"), "utf-8");

// state.js
check("state.js exports get",
  /export function get\(/.test(stateJs),
  "state.js missing get"
);
check("state.js exports set",
  /export function set\(/.test(stateJs),
  "state.js missing set"
);
check("state.js exports subscribe",
  /export function subscribe\(/.test(stateJs),
  "state.js missing subscribe"
);
check("state.js exports subscribeAll",
  /export function subscribeAll\(/.test(stateJs),
  "state.js missing subscribeAll"
);
check("state.js exports snapshot",
  /export function snapshot\(/.test(stateJs),
  "state.js missing snapshot"
);
check("state.js exports KEYS",
  /export const KEYS/.test(stateJs),
  "state.js missing KEYS"
);
check("state.js tracks 9 state keys",
  (stateJs.match(/^\s+\w+:\s*null,$/gm) || []).length === 9,
  "state.js should track 9 state keys (session, network, eventCache, cachePerfiles, amendmentData, amendmentNext, rollbackTarget, currentPostId, editorDraft)"
);

// utils.js
check("utils.js exports escapeHtml",
  /export function escapeHtml\(/.test(utilsJs),
  "utils.js missing escapeHtml"
);
check("utils.js exports escapeAttr",
  /export function escapeAttr\(/.test(utilsJs),
  "utils.js missing escapeAttr"
);
check("utils.js exports extractTitle",
  /export function extractTitle\(/.test(utilsJs),
  "utils.js missing extractTitle"
);
check("utils.js exports formatDraftAge",
  /export function formatDraftAge\(/.test(utilsJs),
  "utils.js missing formatDraftAge"
);

// CSS modules
check("styles.css uses @import for tokens/index",
  /@import\s+["']\.\/tokens\/index\.css["']/.test(stylesCss),
  "styles.css missing @import for tokens/index.css"
);
check("styles.css uses @import for base",
  /@import\s+["']\.\/base\.css["']/.test(stylesCss),
  "styles.css missing @import for base.css"
);
check("styles.css uses @import for components",
  /@import\s+["']\.\/components\.css["']/.test(stylesCss),
  "styles.css missing @import for components.css"
);
check("styles.css uses @import for animations",
  /@import\s+["']\.\/animations\.css["']/.test(stylesCss),
  "styles.css missing @import for animations.css"
);
check("styles.css uses @import for print",
  /@import\s+["']\.\/print\.css["']/.test(stylesCss),
  "styles.css missing @import for print.css"
);
check("tokens/index.css re-exports 3 token layers",
  /@import\s+["']\.\/primitives\.css["']/.test(tokensIndexCss)
    && /@import\s+["']\.\/semantic\.css["']/.test(tokensIndexCss)
    && /@import\s+["']\.\/components\.css["']/.test(tokensIndexCss),
  "tokens/index.css missing one of primitives/semantic/components"
);
check("tokens/primitives.css has --sol-base03 (Solarized anchor)",
  /--sol-base03:\s*#002b36/i.test(primitivesCss),
  "primitives.css missing Solarized base03 #002b36"
);
check("tokens/semantic.css has :root variables",
  /:root\s*\{/.test(semanticCss),
  "semantic.css missing :root"
);
check("tokens/semantic.css has [data-theme=dark] override",
  /\[data-theme="dark"\]/.test(semanticCss),
  "semantic.css missing [data-theme=dark]"
);
check("tokens/semantic.css has prefers-color-scheme media",
  /@media\s*\(prefers-color-scheme:\s*dark\)/.test(semanticCss),
  "semantic.css missing prefers-color-scheme: dark media query"
);
check("tokens/semantic.css uses :not([data-theme=light]) guard",
  /:not\(\[data-theme="light"\]\)/.test(semanticCss),
  "semantic.css missing :not([data-theme=light]) guard for system pref"
);
check("base.css has body background",
  /body\s*\{[\s\S]*?background:\s*var\(--bg-page\)/.test(baseCss),
  "base.css missing body background using --bg-page"
);
check("base.css has prefers-reduced-motion",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(baseCss),
  "base.css missing prefers-reduced-motion guard"
);
check("components.css has no @keyframes",
  !/@keyframes/.test(componentsCss),
  "components.css should not contain @keyframes (those go in animations.css)"
);
check("components.css has no @media print",
  !/@media\s+print/.test(componentsCss),
  "components.css should not contain @media print (those go in print.css)"
);
check("components.css has no [data-theme=dark] overrides",
  !/\[data-theme="dark"\]\s+\./.test(componentsCss),
  "components.css still contains [data-theme=dark] .X overrides (semantic tokens should handle dark mode)"
);
check("print.css has @media print",
  /@media\s+print/.test(printCss),
  "print.css missing @media print"
);
check("animations.css has @keyframes pageFadeIn",
  /@keyframes\s+pageFadeIn/.test(animationsCss),
  "animations.css missing pageFadeIn"
);
check("animations.css has @keyframes toastIn/Out",
  /@keyframes\s+toastIn/.test(animationsCss) && /@keyframes\s+toastOut/.test(animationsCss),
  "animations.css missing toastIn or toastOut"
);

// Window globals removed (except in comments)
const allJsAndViews = [
  appJs, postDetailJs, myLabJs, profileJs, stateJs, utilsJs,
  readFileSync(join(ROOT, "src/js/bookmarks.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/voting.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/comments.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/revisions.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/feed-filters.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/exporter.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/editor-images.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/editor-toolbar.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/network.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/parser.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/router.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/theme.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/toast.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/diff.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/roles.js"), "utf-8"),
  readFileSync(join(ROOT, "src/js/tags.js"), "utf-8"),
];

for (const src of allJsAndViews) {
    const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/window\.__\w+\s*=/.test(stripped)) {
        const m = stripped.match(/window\.__\w+\s*=[^\n]*/);
        check(`no window.__ assignment in ${(m && m[0].slice(0, 40))}`, false, `found assignment: ${m && m[0].slice(0, 60)}`);
        break;
    }
}
check("no window.__ assignments in production code",
    !allJsAndViews.some(src => /window\.__\w+\s*=/.test(src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""))),
    "found window.__ assignment in code"
);

// State module is imported in app.js, views, and other modules
check("app.js imports state module",
  /import \* as State from ['"]\.\/state\.js['"]/.test(appJs),
  "app.js missing state import"
);
check("post-detail.js imports state module",
  /import \* as State from ['"]\.\.\/js\/state\.js['"]/.test(postDetailJs),
  "post-detail.js missing state import"
);
check("my-lab.js imports state module",
  /import \* as State from ['"]\.\.\/js\/state\.js['"]/.test(myLabJs),
  "my-lab.js missing state import"
);
check("profile.js imports state module",
  /import \* as State from ['"]\.\.\/js\/state\.js['"]/.test(profileJs),
  "profile.js missing state import"
);

// Legacy dirs must NOT exist
const legacyDirs = ["src/core", "src/network", "src/ui", "src/utils", "src/components"];
for (const d of legacyDirs) {
    check(`legacy dir removed: ${d}`,
      !existsSync(join(ROOT, d)),
      `${d} should not exist (was removed in refactor 2026-06-06)`
    );
}

// No escapeHtml/escapeAttr duplication
const escapeHtmlDefinitions = allJsAndViews.filter(s => /function\s+escapeHtml\s*\(/.test(s));
const escapeAttrDefinitions = allJsAndViews.filter(s => /function\s+escapeAttr\s*\(/.test(s));
check("escapeHtml defined once (in utils.js)",
  escapeHtmlDefinitions.length === 1,
  `escapeHtml defined ${escapeHtmlDefinitions.length} times: ${escapeHtmlDefinitions.length > 1 ? "DUPLICATED" : ""}`
);
check("escapeAttr defined once (in utils.js)",
  escapeAttrDefinitions.length === 1,
  `escapeAttr defined ${escapeAttrDefinitions.length} times: ${escapeAttrDefinitions.length > 1 ? "DUPLICATED" : ""}`
);

// extractTitle defined once
const extractTitleDefinitions = allJsAndViews.filter(s => /function\s+extractTitle\s*\(/.test(s));
check("extractTitle defined once (in utils.js)",
  extractTitleDefinitions.length === 1,
  `extractTitle defined ${extractTitleDefinitions.length} times`
);

// JSDoc presence: at least 70% of modules have JSDoc on exports
const modulesWithJSDoc = [
  stateJs, utilsJs, bookmarksJs, votingJs, commentsJs, revisionsJs,
  feedFiltersJs, exporterJs, networkJs, routerJs, themeJs, toastJs,
  diffJs, rolesJs, tagsJs, editorImagesJs, editorToolbarJs
];
const withJSDoc = modulesWithJSDoc.filter(s => (s.match(/@param|@returns|@type|@typedef/g) || []).length >= 3).length;
check(`${withJSDoc}/${modulesWithJSDoc.length} modules have JSDoc annotations`,
  withJSDoc >= 14,
  `only ${withJSDoc} of ${modulesWithJSDoc.length} modules have JSDoc`
);

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n${"─".repeat(64)}`);
const total = passed + failed;
console.log(`\n  Results: ${passed}/${total} passed, ${failed}/${total} failed\n`);
process.exit(failed > 0 ? 1 : 0);
