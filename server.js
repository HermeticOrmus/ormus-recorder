import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { readdir, stat, unlink, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const STATIC = join(__dir, "static");
const RECORDINGS = join(__dir, "recordings");
const NOTES = join(__dir, "notes");
const NOTES_ORGANIZED = join(__dir, "notes", "organized");
const PORT = process.env.PORT || 8082;

// --- Whisper configuration ---
// Point these to your Whisper binary and model.
// For mlx-whisper (Apple Silicon): install via `pip install mlx-whisper`
// For openai-whisper: install via `pip install openai-whisper`
const WHISPER = process.env.WHISPER_BIN || "whisper";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "small";
const WHISPER_LANG = process.env.WHISPER_LANG || "en";
const WHISPER_PATH = process.env.WHISPER_PATH || process.env.PATH;

// --- Relay targets (optional) ---
// Configure SSH targets to relay recordings to other machines.
// Format: { host: "ssh-alias", path: "/remote/path/" }
const TARGETS = {
  local: { host: null, path: RECORDINGS },
};
if (process.env.RELAY_TARGETS) {
  // Parse RELAY_TARGETS as JSON: {"moon":{"host":"moon","path":"~/recordings/"}}
  try {
    Object.assign(TARGETS, JSON.parse(process.env.RELAY_TARGETS));
  } catch (err) {
    console.warn("Invalid RELAY_TARGETS env var:", err.message);
  }
}

// --- Webhook notification (optional) ---
// Set NOTIFY_WEBHOOK_URL to POST transcripts to an external service.
// The server sends JSON: { author, filename, transcript, timestamp }
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || "";

await mkdir(RECORDINGS, { recursive: true });
await mkdir(NOTES, { recursive: true });
await mkdir(NOTES_ORGANIZED, { recursive: true });

// --- Serial processing queue for transcription ---
// This is a simple in-process FIFO queue. Transcription jobs are serialized
// so Whisper doesn't compete with itself for GPU/CPU. Each recording is
// transcribed one at a time in the order received.
const processingQueue = [];
let isProcessing = false;

function enqueueTranscription(...args) {
  processingQueue.push(args);
  console.log(`Queued transcription (${processingQueue.length} in queue)`);
  processNext();
}

async function processNext() {
  if (isProcessing || processingQueue.length === 0) return;
  isProcessing = true;
  const args = processingQueue.shift();
  try {
    await transcribeAndRelay(...args);
  } catch (err) {
    console.error("Transcription pipeline error:", err.message);
  }
  isProcessing = false;
  processNext();
}

// --- Auth: map Cloudflare Access email to identity (optional) ---
// If behind Cloudflare Access, the cf-access-authenticated-user-email header
// identifies the user. Map emails to friendly names via env var.
// Format: EMAIL_MAP='{"user@example.com":"alice","other@example.com":"bob"}'
const EMAIL_TO_IDENTITY = process.env.EMAIL_MAP
  ? JSON.parse(process.env.EMAIL_MAP)
  : {};

function getAuthor(req) {
  const email = req.headers["cf-access-authenticated-user-email"];
  if (email && EMAIL_TO_IDENTITY[email]) return EMAIL_TO_IDENTITY[email];
  if (email) return email.split("@")[0];
  return req.body?.author || "unknown";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: RECORDINGS,
    filename: (_, file, cb) => {
      const ts = new Date()
        .toISOString()
        .replace(/[:.T]/g, "-")
        .slice(0, 19);
      const ext = extname(file.originalname) || ".webm";
      cb(null, `rec-${ts}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const noteUpload = multer({
  storage: multer.diskStorage({
    destination: NOTES,
    filename: (_, file, cb) => {
      const ts = new Date()
        .toISOString()
        .replace(/[:.T]/g, "-")
        .slice(0, 19);
      const ext = extname(file.originalname) || ".webm";
      cb(null, `note-${ts}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const app = express();
app.use(express.json());

// --- Static files ---
app.use("/static", express.static(STATIC));
app.use("/recordings", express.static(RECORDINGS));
app.get("/", (_, res) => res.sendFile(join(STATIC, "index.html")));
app.get("/manifest.json", (_, res) => res.sendFile(join(STATIC, "manifest.json")));
app.get("/sw.js", (_, res) => {
  res.type("application/javascript").sendFile(join(STATIC, "sw.js"));
});

// --- Identity from Cloudflare Access ---
app.get("/api/me", (req, res) => {
  const email = req.headers["cf-access-authenticated-user-email"] || "";
  const identity = EMAIL_TO_IDENTITY[email] || email.split("@")[0] || "unknown";
  res.json({ identity, email });
});

// --- Upload (auto-transcribe + relay) ---
app.post("/api/upload", upload.single("audio"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ status: "error", error: "No file" });

  const target = req.body?.target || "local";
  const author = getAuthor(req);
  const base = file.filename.replace(extname(file.filename), "");
  const txtPath = join(RECORDINGS, base + ".txt");
  const metaPath = join(RECORDINGS, base + ".meta.json");

  // Save metadata
  const meta = {
    filename: file.filename,
    author,
    target,
    type: "voice-message",
    size: file.size,
    created: new Date().toISOString(),
    transcribed: false,
    relayed: false,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  const result = {
    status: "saved",
    filename: file.filename,
    size: file.size,
    target: "local",
    author,
    path: file.path,
  };

  // Auto-transcribe in background (serialized queue)
  enqueueTranscription(file.path, file.filename, base, txtPath, metaPath, target, author);

  // Respond immediately -- transcription happens async
  if (target !== "local") {
    result.target = target;
    result.relay = "pending (transcribe first, then relay)";
  }

  res.json(result);
});

// --- Notify webhook (optional) ---
async function notifyWebhook(author, filename, transcript) {
  if (!NOTIFY_WEBHOOK_URL) return false;

  try {
    const resp = await fetch(NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        filename,
        transcript: transcript.trim(),
        timestamp: new Date().toISOString(),
      }),
    });
    if (resp.ok) {
      console.log(`Webhook notified: ${filename} by ${author}`);
      return true;
    }
    console.error(`Webhook failed (${resp.status})`);
    return false;
  } catch (err) {
    console.error(`Webhook error: ${err.message?.slice(0, 200)}`);
    return false;
  }
}

// --- Clean up transcript with Claude Haiku (optional) ---
async function cleanupTranscript(rawText, author) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return rawText;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLEANUP_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `Clean up this voice transcript. This will be read on a phone screen.

Formatting:
- Use **bold** for key names, projects, decisions, or important terms
- Use numbered lists for sequential steps
- Use bullet lists for unordered items
- First line: one bold sentence summarizing the main point

Structure:
- Short paragraphs (2-3 sentences max)
- If multiple topics, separate with blank lines
- If there are action items, list them at the end under **Action items:**

Cleanup:
- Remove filler words (um, uh, like, basically, you know)
- Fix punctuation and capitalization
- Preserve the original language
- Do NOT add information that wasn't in the original
- Keep it concise
- Output ONLY the cleaned transcript, nothing else

Author: ${author}

Raw transcript:
${rawText}`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Cleanup failed (${response.status}):`, err.slice(0, 200));
      return rawText;
    }

    const data = await response.json();
    const cleaned = data.content?.[0]?.text;
    if (!cleaned) return rawText;

    console.log(`Transcript cleaned (${rawText.length} -> ${cleaned.length} chars)`);
    return cleaned;
  } catch (err) {
    console.error("Transcript cleanup error:", err.message?.slice(0, 200));
    return rawText;
  }
}


// --- Auto-transcribe then relay ---
async function transcribeAndRelay(filepath, filename, base, txtPath, metaPath, target, author) {
  const exec = promisify(execFile);

  // Transcribe
  try {
    await exec(WHISPER, [
      filepath,
      "--model", WHISPER_MODEL,
      "--output_dir", RECORDINGS,
      "--output_format", "txt",
      "--language", WHISPER_LANG,
    ], { timeout: 180_000, env: { ...process.env, PATH: WHISPER_PATH } });
    console.log(`Transcribed: ${filename}`);

    // Update metadata
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      meta.transcribed = true;
      meta.transcript_file = base + ".txt";
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {}

    // Clean up transcript, then notify webhook
    try {
      let transcript = await readFile(txtPath, "utf-8");
      const cleaned = await cleanupTranscript(transcript, author);
      if (cleaned !== transcript) {
        await writeFile(txtPath.replace(".txt", ".raw.txt"), transcript);
        await writeFile(txtPath, cleaned);
        transcript = cleaned;
      }
      const notified = await notifyWebhook(author, filename, transcript);
      try {
        const m = JSON.parse(await readFile(metaPath, "utf-8"));
        m.webhook_sent = notified;
        if (notified) m.webhook_sent_at = new Date().toISOString();
        await writeFile(metaPath, JSON.stringify(m, null, 2));
      } catch {}
    } catch (err) {
      console.error(`Post-transcription hook failed: ${err.message?.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`Transcription failed for ${filename}:`, err.message?.slice(0, 200));
  }

  // Relay to target (audio + transcript + metadata)
  if (target !== "local" && TARGETS[target]?.host) {
    const relayResult = await relayFile(filepath, filename, target);
    console.log(`Relayed audio to ${target}:`, relayResult.status);

    // Relay transcript
    try {
      await stat(txtPath);
      await relayFile(txtPath, base + ".txt", target);
      console.log(`Relayed transcript to ${target}`);
    } catch {}

    // Relay metadata
    try {
      await stat(metaPath);
      await relayFile(metaPath, base + ".meta.json", target);
      console.log(`Relayed metadata to ${target}`);
    } catch {}

    // Update metadata with relay status
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      meta.relayed = true;
      meta.relayed_at = new Date().toISOString();
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }
}

// --- Relay existing recording ---
app.post("/api/relay/:filename/:target", async (req, res) => {
  const { filename, target } = req.params;
  const filepath = join(RECORDINGS, filename);

  try {
    await stat(filepath);
  } catch {
    return res.status(404).json({ status: "error", error: "Not found" });
  }

  if (!TARGETS[target]) {
    return res.status(400).json({ status: "error", error: "Unknown target" });
  }
  if (!TARGETS[target].host) {
    return res.json({ status: "already_local", target });
  }

  const result = await relayFile(filepath, filename, target);
  res.json(result);
});

// --- Transcribe ---
app.post("/api/transcribe/:filename", async (req, res) => {
  const { filename } = req.params;
  const filepath = join(RECORDINGS, filename);
  const base = filename.replace(extname(filename), "");
  const txtPath = join(RECORDINGS, base + ".txt");

  try {
    await stat(filepath);
  } catch {
    return res.status(404).json({ status: "error", error: "Not found" });
  }

  // Check cache
  try {
    const cached = await readFile(txtPath, "utf-8");
    return res.json({ status: "cached", text: cached });
  } catch {
    // Not cached, proceed
  }

  try {
    const exec = promisify(execFile);
    await exec(WHISPER, [
      filepath,
      "--model", WHISPER_MODEL,
      "--output_dir", RECORDINGS,
      "--output_format", "txt",
      "--language", WHISPER_LANG,
    ], { timeout: 120_000, env: { ...process.env, PATH: WHISPER_PATH } });

    const text = await readFile(txtPath, "utf-8");
    res.json({ status: "transcribed", text });
  } catch (err) {
    res.json({
      status: "error",
      error: err.message?.slice(0, 500) || "Transcription failed",
    });
  }
});

// --- List recordings ---
app.get("/api/recordings", async (_, res) => {
  const files = await readdir(RECORDINGS);
  const recs = [];

  for (const f of files) {
    if (!f.startsWith("rec-") || !f.endsWith(".webm")) continue;
    const fp = join(RECORDINGS, f);
    const s = await stat(fp);
    const base = f.replace(extname(f), "");
    const txtExists = files.includes(base + ".txt");
    const metaFile = join(RECORDINGS, base + ".meta.json");
    let author = "unknown";
    let type = "voice-message";
    try {
      const meta = JSON.parse(await readFile(metaFile, "utf-8"));
      author = meta.author || "unknown";
      type = meta.type || "voice-message";
    } catch {}
    recs.push({
      filename: f,
      size: s.size,
      created: s.birthtime.toISOString(),
      has_transcript: txtExists,
      author,
      type,
    });
  }

  recs.sort((a, b) => b.created.localeCompare(a.created));
  res.json(recs);
});

// --- Delete ---
app.delete("/api/recordings/:filename", async (req, res) => {
  const { filename } = req.params;
  const filepath = join(RECORDINGS, filename);
  try {
    await unlink(filepath);
    const base = filename.replace(extname(filename), "");
    try { await unlink(join(RECORDINGS, base + ".txt")); } catch {}
    try { await unlink(join(RECORDINGS, base + ".meta.json")); } catch {}
    res.json({ status: "deleted", filename });
  } catch {
    res.status(404).json({ status: "error", error: "Not found" });
  }
});

// ============================================================
// --- Quick Notes ---
// ============================================================

// --- Save a quick note ---
app.post("/api/notes", noteUpload.single("audio"), async (req, res) => {
  const text = req.body?.text || "";
  const author = getAuthor(req);
  const file = req.file;

  if (!text.trim()) {
    return res.status(400).json({ status: "error", error: "No text content" });
  }

  const ts = new Date().toISOString().replace(/[:.T]/g, "-").slice(0, 19);
  const noteId = `note-${ts}`;
  const metaPath = join(NOTES, `${noteId}.json`);

  const meta = {
    id: noteId,
    author,
    text: text.trim(),
    audio: file ? file.filename : null,
    created: new Date().toISOString(),
    organized: false,
  };

  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`Quick note saved: ${noteId} by ${author} (${text.trim().split(/\s+/).length} words)`);

  // If speech API didn't capture, transcribe with Whisper in background
  if (file && (req.body?.needs_transcription === "true" || text === "[pending-transcription]")) {
    transcribeNote(file.path, noteId, metaPath).catch(
      (err) => console.error("Note transcription error:", err.message)
    );
  }

  res.json({ status: "saved", id: noteId });
});

// --- Transcribe a note with Whisper ---
async function transcribeNote(audioPath, noteId, metaPath) {
  const exec = promisify(execFile);
  const txtPath = join(NOTES, noteId + ".txt");

  try {
    await exec(WHISPER, [
      audioPath,
      "--model", WHISPER_MODEL,
      "--output_dir", NOTES,
      "--output_format", "txt",
      "--language", WHISPER_LANG,
    ], { timeout: 180_000, env: { ...process.env, PATH: WHISPER_PATH } });

    // Read transcript and update note metadata
    const transcript = await readFile(txtPath, "utf-8");
    const meta = JSON.parse(await readFile(metaPath, "utf-8"));
    meta.text = transcript.trim();
    await writeFile(metaPath, JSON.stringify(meta, null, 2));
    console.log(`Note transcribed: ${noteId}`);
  } catch (err) {
    console.error(`Note transcription failed for ${noteId}:`, err.message?.slice(0, 200));
  }
}

// --- List quick notes ---
app.get("/api/notes", async (_, res) => {
  const files = await readdir(NOTES);
  const notes = [];

  for (const f of files) {
    if (!f.startsWith("note-") || !f.endsWith(".json")) continue;
    try {
      const meta = JSON.parse(await readFile(join(NOTES, f), "utf-8"));
      notes.push(meta);
    } catch {}
  }

  notes.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  res.json(notes);
});

// --- Clean / organize notes into Obsidian-style .md ---
app.post("/api/notes/clean", async (_, res) => {
  const files = await readdir(NOTES);
  const rawNotes = [];

  // Collect unorganized notes
  for (const f of files) {
    if (!f.startsWith("note-") || !f.endsWith(".json")) continue;
    try {
      const meta = JSON.parse(await readFile(join(NOTES, f), "utf-8"));
      if (!meta.organized) rawNotes.push({ file: f, ...meta });
    } catch {}
  }

  if (rawNotes.length === 0) {
    return res.json({ status: "organized", organized: 0, message: "No new notes to organize" });
  }

  // Group notes by date
  const byDate = {};
  for (const note of rawNotes) {
    const date = (note.created || "").slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(note);
  }

  const organized = [];

  for (const [date, notes] of Object.entries(byDate)) {
    // Extract tags from all notes for this date
    const allText = notes.map(n => n.text).join(" ").toLowerCase();
    const tags = extractTags(allText);
    const dateFormatted = formatDateHuman(date);

    // Build Obsidian-style markdown
    let md = `---\n`;
    md += `date: ${date}\n`;
    md += `tags: [${tags.map(t => `"${t}"`).join(", ")}]\n`;
    md += `authors: [${[...new Set(notes.map(n => n.author))].map(a => `"${a}"`).join(", ")}]\n`;
    md += `type: voice-notes\n`;
    md += `---\n\n`;
    md += `# Voice Notes -- ${dateFormatted}\n\n`;

    for (const note of notes) {
      const time = new Date(note.created).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      md += `## ${time} -- ${note.author}\n\n`;
      md += `${note.text}\n\n`;

      // Extract inline items
      const items = extractItems(note.text);
      if (items.tasks.length > 0) {
        md += `### Tasks\n`;
        for (const task of items.tasks) md += `- [ ] ${task}\n`;
        md += `\n`;
      }
      if (items.ideas.length > 0) {
        md += `### Ideas\n`;
        for (const idea of items.ideas) md += `- ${idea}\n`;
        md += `\n`;
      }

      md += `---\n\n`;
    }

    // Write organized .md
    const mdFilename = `${date}-voice-notes.md`;
    await writeFile(join(NOTES_ORGANIZED, mdFilename), md);
    organized.push(mdFilename);
    console.log(`Organized: ${mdFilename} (${notes.length} notes)`);
  }

  // Mark notes as organized
  for (const note of rawNotes) {
    try {
      const metaPath = join(NOTES, note.file);
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      meta.organized = true;
      meta.organized_at = new Date().toISOString();
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }

  res.json({
    status: "organized",
    organized: rawNotes.length,
    files: organized,
  });
});

// --- Serve organized notes ---
app.get("/api/notes/organized", async (_, res) => {
  const files = await readdir(NOTES_ORGANIZED);
  const mds = [];

  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const content = await readFile(join(NOTES_ORGANIZED, f), "utf-8");
    const s = await stat(join(NOTES_ORGANIZED, f));
    mds.push({
      filename: f,
      content,
      modified: s.mtime.toISOString(),
    });
  }

  mds.sort((a, b) => b.filename.localeCompare(a.filename));
  res.json(mds);
});

// --- Tag extraction (simple keyword matching) ---
function extractTags(text) {
  const tagMap = {
    grocery: /\b(grocery|groceries|store|shopping|buy|purchase)\b/i,
    idea: /\b(idea|thinking|what if|could we|should we|proposal)\b/i,
    task: /\b(need to|have to|must|should|todo|to-do|deadline)\b/i,
    project: /\b(project|build|create|develop|launch|platform|website|app)\b/i,
    meeting: /\b(meeting|call|discuss|conversation|chat)\b/i,
    personal: /\b(personal|family|home|house|doctor|health)\b/i,
    business: /\b(client|business|company|revenue|sales|marketing)\b/i,
    learning: /\b(learn|study|course|tutorial|practice)\b/i,
  };

  const found = [];
  for (const [tag, regex] of Object.entries(tagMap)) {
    if (regex.test(text)) found.push(tag);
  }
  return found.length > 0 ? found : ["note"];
}

// --- Extract actionable items from note text ---
function extractItems(text) {
  const tasks = [];
  const ideas = [];
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (/\b(need to|have to|must|should|todo|remember to|don't forget)\b/.test(lower)) {
      tasks.push(s);
    } else if (/\b(idea|what if|could we|thinking about|wondering if)\b/.test(lower)) {
      ideas.push(s);
    }
  }

  return { tasks, ideas };
}

// --- Format date for display ---
function formatDateHuman(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// --- SSH relay helper ---
async function relayFile(filepath, filename, target) {
  const t = TARGETS[target];
  const exec = promisify(execFile);

  try {
    // Ensure remote dir exists
    await exec("ssh", [t.host, `mkdir -p ${t.path}`], { timeout: 10_000 });
    // SCP
    await exec("scp", [filepath, `${t.host}:${t.path}${filename}`], { timeout: 30_000 });
    return { status: "sent", target, path: `${t.path}${filename}` };
  } catch (err) {
    return { status: "error", target, error: err.message?.slice(0, 300) || "SSH failed" };
  }
}

// --- File Lifecycle: Cleanup old audio ---
const PRUNE_AGE_DAYS = parseInt(process.env.PRUNE_AGE_DAYS) || 7;

app.get("/api/recordings/stats", async (_, res) => {
  const files = await readdir(RECORDINGS);
  const webmFiles = files.filter(f => f.startsWith("rec-") && f.endsWith(".webm"));
  const txtFiles = files.filter(f => f.startsWith("rec-") && f.endsWith(".txt") && !f.endsWith(".raw.txt"));
  const rawFiles = files.filter(f => f.endsWith(".raw.txt"));
  const metaFiles = files.filter(f => f.startsWith("rec-") && f.endsWith(".meta.json"));

  let totalAudioBytes = 0;
  let prunableCount = 0;
  let prunableBytes = 0;
  const now = Date.now();
  const ageMs = PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const f of webmFiles) {
    const s = await stat(join(RECORDINGS, f));
    totalAudioBytes += s.size;
    const base = f.replace(extname(f), "");
    const mp = join(RECORDINGS, base + ".meta.json");
    try {
      const meta = JSON.parse(await readFile(mp, "utf-8"));
      const age = now - new Date(meta.created).getTime();
      if (meta.transcribed && age > ageMs) {
        prunableCount++;
        prunableBytes += s.size;
      }
    } catch {}
  }

  res.json({
    recordings: webmFiles.length,
    transcripts: txtFiles.length,
    raw_transcripts: rawFiles.length,
    metadata: metaFiles.length,
    audio_size_mb: (totalAudioBytes / 1024 / 1024).toFixed(1),
    prunable: prunableCount,
    prunable_mb: (prunableBytes / 1024 / 1024).toFixed(1),
    prune_age_days: PRUNE_AGE_DAYS,
  });
});

app.post("/api/recordings/cleanup", async (req, res) => {
  const dryRun = req.query.dry_run === "true";
  const maxAgeDays = parseInt(req.query.age_days) || PRUNE_AGE_DAYS;
  const files = await readdir(RECORDINGS);
  const webmFiles = files.filter(f => f.startsWith("rec-") && f.endsWith(".webm"));
  const now = Date.now();
  const ageMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const pruned = [];
  const skipped = [];

  for (const f of webmFiles) {
    const base = f.replace(extname(f), "");
    const mp = join(RECORDINGS, base + ".meta.json");
    const ap = join(RECORDINGS, f);
    const s = await stat(ap);

    let meta;
    try {
      meta = JSON.parse(await readFile(mp, "utf-8"));
    } catch {
      skipped.push({ file: f, reason: "no metadata" });
      continue;
    }

    const age = now - new Date(meta.created).getTime();
    const ageDays = Math.floor(age / (24 * 60 * 60 * 1000));

    if (!meta.transcribed) {
      skipped.push({ file: f, reason: "not transcribed", age_days: ageDays });
      continue;
    }
    if (age < ageMs) {
      skipped.push({ file: f, reason: "only " + ageDays + "d old (need " + maxAgeDays + "d)", age_days: ageDays });
      continue;
    }
    if (meta.audio_pruned) {
      skipped.push({ file: f, reason: "already pruned" });
      continue;
    }

    if (!dryRun) {
      try {
        await unlink(ap);
        meta.audio_pruned = true;
        meta.audio_pruned_at = new Date().toISOString();
        meta.audio_size_before_prune = s.size;
        await writeFile(mp, JSON.stringify(meta, null, 2));
      } catch (err) {
        skipped.push({ file: f, reason: "delete failed: " + err.message });
        continue;
      }
    }

    pruned.push({
      file: f,
      size: s.size,
      size_human: (s.size / 1024).toFixed(0) + " KB",
      age_days: ageDays,
      author: meta.author,
    });
  }

  const totalFreed = pruned.reduce((sum, p) => sum + p.size, 0);
  const freedStr = totalFreed > 1024 * 1024
    ? (totalFreed / 1024 / 1024).toFixed(1) + " MB"
    : (totalFreed / 1024).toFixed(0) + " KB";

  console.log("Cleanup " + (dryRun ? "(dry run)" : "") + ": pruned " + pruned.length + " files, freed " + freedStr);

  res.json({
    dry_run: dryRun,
    pruned: pruned.length,
    freed_mb: (totalFreed / 1024 / 1024).toFixed(1),
    freed_human: freedStr,
    details: pruned,
    skipped,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Recorder server running on http://0.0.0.0:${PORT}`);
});
