// 拓曜字幕工作室：本機伺服器（只綁 127.0.0.1）
import express from 'express';
import multer from 'multer';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { probe, cutClip, transcribe, run, VIDEO_EXTS } from './lib/media.mjs';
import { analyze, buildOverlayData, toSrt, Analysis, EnEdits, applyEnEdits, llmStatus } from './lib/analyze.mjs';
import { renderVideo } from './lib/render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECTS = join(here, 'projects');
const PORT = +process.env.PORT || 5177;
await mkdir(join(PROJECTS, '_uploads'), { recursive: true });

const app = express();

// ── 只接受工具自己頁面送來的請求（防 CSRF 與 DNS rebinding）──
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map(h => `http://${h}`));
const deny = res => res.status(403).json({ error: '拒絕來自外部網站的請求' });
app.use((req, res, next) => ALLOWED_HOSTS.has(req.headers.host) ? next() : deny(res));
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (origin && !ALLOWED_ORIGINS.has(origin)) return deny(res);
  if (site && !['same-origin', 'none'].includes(site)) return deny(res);
  // 會改資料的請求必須帶自訂標頭：外部網頁無法在不經 CORS 預檢的情況下加上
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-studio-request'] !== '1') return deny(res);
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static(join(here, 'public')));
const upload = multer({ dest: join(PROJECTS, '_uploads'), limits: { fileSize: 4 * 1024 ** 3, files: 1 } });

// ── 專案存取 ──
const pdir = id => {
  if (!/^[a-z0-9-]+$/.test(id)) throw Object.assign(new Error('專案編號不正確'), { status: 400 });
  return join(PROJECTS, id);
};
const readJson = async (id, name) => JSON.parse(await readFile(join(pdir(id), name), 'utf8'));
const writeJson = (id, name, v) => writeFile(join(pdir(id), name), JSON.stringify(v, null, 2));
async function patchMeta(id, patch) {
  const meta = { ...(await readJson(id, 'meta.json')), ...patch, updatedAt: new Date().toISOString() };
  await writeJson(id, 'meta.json', meta);
  return meta;
}
const stamp = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const busy = new Set();

async function rebuild(id) {
  const meta = await readJson(id, 'meta.json');
  const words = await readJson(id, 'words.json');
  const analysis = await readJson(id, 'analysis.json');
  const data = buildOverlayData(words, analysis, {
    source: meta.source, sourceStamp: meta.sourceStamp, duration: meta.end - meta.start,
  });
  await writeJson(id, 'data.json', data);
  await writeFile(join(pdir(id), 'subtitles.srt'), toSrt(data));
  return data;
}

async function runAnalyze(id) {
  const meta = await readJson(id, 'meta.json');
  const llm = llmStatus();
  if (!llm.ready) {
    await patchMeta(id, { status: 'needs_key', step: `已完成聽寫。${llm.reason}，重新啟動工具後按「重新分析」。` });
    return;
  }
  await patchMeta(id, { status: 'analyzing', step: `${llm.label} 正在翻譯、挑選語塊與專有名詞…`, error: null });
  const words = await readJson(id, 'words.json');
  const analysis = await analyze(words, { source: meta.source, density: meta.density });
  await writeJson(id, 'analysis.json', analysis);
  await rebuild(id);
  await patchMeta(id, { status: 'ready', step: '分析完成，可以預覽與修改' });
}

async function pipeline(id) {
  busy.add(id);
  try {
    const meta = await readJson(id, 'meta.json');
    const dir = pdir(id);
    await patchMeta(id, { status: 'cutting', step: '裁切影片中…' });
    await cutClip(meta.sourceFile, dir, meta.start, meta.end, meta.demuxer);
    await patchMeta(id, { status: 'transcribing', step: 'whisper 聽寫英文中（第一次使用會先下載模型）…' });
    const words = await transcribe(join(dir, 'clip.wav'), dir);
    if (!words.length) throw new Error('沒有聽到任何英文語音，請確認片段有聲音');
    await writeJson(id, 'words.json', words);
    await runAnalyze(id);
  } catch (e) {
    await patchMeta(id, { status: 'error', error: e.message, step: '處理失敗' });
  } finally {
    busy.delete(id);
  }
}

const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(e.status || 500).json({ error: e.message }));

// ── API ──
app.get('/api/health', wrap(async (_req, res) => {
  const check = async (cmd, args) => { try { await run(cmd, args); return true; } catch { return false; } };
  res.json({
    llm: llmStatus(),
    ffmpeg: await check('ffmpeg', ['-version']),
    whisper: await check('whisper', ['--help']),
    whisperModel: process.env.WHISPER_MODEL || 'medium.en',
  });
}));

app.get('/api/projects', wrap(async (_req, res) => {
  const ids = (await readdir(PROJECTS)).filter(d => !d.startsWith('_') && existsSync(join(PROJECTS, d, 'meta.json')));
  const list = await Promise.all(ids.map(id => readJson(id, 'meta.json')));
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}));

app.post('/api/projects', upload.single('file'), wrap(async (req, res) => {
  const { path: localPath, source = '', density = 'medium' } = req.body;
  const start = +req.body.start || 0;
  const badExt = name => !VIDEO_EXTS.has(extname(name).toLowerCase());
  let sourceFile;
  if (req.file) {
    if (badExt(req.file.originalname || '')) {
      await rm(req.file.path, { force: true });
      return res.status(400).json({ error: '只支援 mp4、mov、m4v、mkv、webm、avi 影片檔' });
    }
    sourceFile = req.file.path + extname(req.file.originalname).toLowerCase();
    await rename(req.file.path, sourceFile);
  } else {
    sourceFile = resolve(String(localPath || '').trim().replace(/^~(?=\/)/, process.env.HOME));
    if (!localPath || !existsSync(sourceFile) || !statSync(sourceFile).isFile()) {
      return res.status(400).json({ error: `找不到影片檔：${localPath || '（未填）'}` });
    }
    if (badExt(sourceFile)) return res.status(400).json({ error: '只支援 mp4、mov、m4v、mkv、webm、avi 影片檔' });
  }
  // 上傳的檔案沒通過檢查就刪掉，不留在暫存區
  const reject = async (status, error) => {
    if (req.file) await rm(sourceFile, { force: true });
    return res.status(status).json({ error });
  };
  let info;
  try { info = await probe(sourceFile); } catch (e) { return reject(e.status || 500, e.message); }
  if (!info.hasAudio) return reject(400, '這個影片檔沒有聲音軌，無法聽寫');
  const end = Math.min(+req.body.end || info.duration, info.duration);
  if (!(end > start)) return reject(400, '結束時間要大於開始時間');
  if (end - start > 600) return reject(400, '一次最多處理 10 分鐘，請把片段切短一點');

  const id = `${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
  await mkdir(pdir(id), { recursive: true });
  const now = new Date().toISOString();
  await writeJson(id, 'meta.json', {
    id, createdAt: now, updatedAt: now, sourceFile, demuxer: info.demuxer, start, end, density,
    source: source.trim(), sourceStamp: source.trim() ? stamp(start) : '',
    status: 'queued', step: '排隊中',
  });
  pipeline(id);
  res.json({ id });
}));

app.get('/api/projects/:id', wrap(async (req, res) => {
  const meta = await readJson(req.params.id, 'meta.json');
  res.json({ ...meta, busy: busy.has(req.params.id) });
}));

app.get('/api/projects/:id/data', wrap(async (req, res) => res.json(await readJson(req.params.id, 'data.json'))));
app.get('/api/projects/:id/analysis', wrap(async (req, res) => {
  res.json({ analysis: await readJson(req.params.id, 'analysis.json'), words: await readJson(req.params.id, 'words.json') });
}));

app.put('/api/projects/:id/analysis', wrap(async (req, res) => {
  const { enEdits, ...body } = req.body;
  const analysis = Analysis.parse(body);
  const edits = EnEdits.parse(enEdits ?? []);
  if (edits.length) {
    const words = await readJson(req.params.id, 'words.json');
    // 第一次手動修改前，保留一份 whisper 原始聽寫
    if (!existsSync(join(pdir(req.params.id), 'words.orig.json'))) await writeJson(req.params.id, 'words.orig.json', words);
    const r = applyEnEdits(words, analysis.cues, edits);
    analysis.cues = r.cues;
    await writeJson(req.params.id, 'words.json', r.words);
  }
  await writeJson(req.params.id, 'analysis.json', analysis);
  res.json(await rebuild(req.params.id));
}));

app.put('/api/projects/:id/meta', wrap(async (req, res) => {
  const { source = '' } = req.body;
  const meta = await readJson(req.params.id, 'meta.json');
  await patchMeta(req.params.id, { source: source.trim(), sourceStamp: source.trim() ? stamp(meta.start) : '' });
  res.json(await rebuild(req.params.id));
}));

app.post('/api/projects/:id/reanalyze', wrap(async (req, res) => {
  const { id } = req.params;
  if (busy.has(id)) return res.status(409).json({ error: '這個專案正在處理中' });
  if (req.body?.density) await patchMeta(id, { density: req.body.density });
  busy.add(id);
  runAnalyze(id)
    .catch(e => patchMeta(id, { status: 'error', error: e.message, step: '分析失敗' }))
    .finally(() => busy.delete(id));
  res.json({ ok: true });
}));

app.post('/api/projects/:id/render', wrap(async (req, res) => {
  const { id } = req.params;
  if (busy.has(id)) return res.status(409).json({ error: '這個專案正在處理中' });
  const meta = await readJson(id, 'meta.json');
  busy.add(id);
  await patchMeta(id, { status: 'rendering', step: '準備渲染…', error: null });
  renderVideo({
    overlayUrl: `http://127.0.0.1:${PORT}/overlay.html?project=${id}`,
    dir: pdir(id), clip: join(pdir(id), 'clip.mp4'), duration: meta.end - meta.start,
    out: join(pdir(id), 'output.mp4'),
    onProgress: p => patchMeta(id, {
      step: p.stage === 'frames' ? `渲染字幕圖層 ${p.done} / ${p.total} 格` : '合成影片中…',
      progress: p.stage === 'frames' ? p.done / p.total : 1,
    }),
  })
    .then(() => patchMeta(id, { status: 'done', step: '影片輸出完成', progress: null, renderedAt: new Date().toISOString() }))
    .catch(e => patchMeta(id, { status: 'error', error: e.message, step: '輸出失敗', progress: null }))
    .finally(() => busy.delete(id));
  res.json({ ok: true });
}));

const FILES = { 'clip.mp4': 'video/mp4', 'output.mp4': 'video/mp4', 'subtitles.srt': 'application/x-subrip' };
app.get('/api/projects/:id/files/:name', wrap(async (req, res) => {
  const { id, name } = req.params;
  if (!FILES[name]) return res.status(404).json({ error: '沒有這個檔案' });
  const file = join(pdir(id), name);
  if (!existsSync(file)) return res.status(404).json({ error: '檔案還沒產生' });
  if (req.query.download) res.attachment(`${id}-${name}`);
  res.type(FILES[name]).sendFile(file);
}));

app.listen(PORT, '127.0.0.1', err => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `✗ 埠號 ${PORT} 已被占用：可能工具已經在別的終端機視窗執行中。請先關掉那個視窗，或在 .env 改用其他 PORT。`
      : `✗ 無法啟動：${err.message}`);
    process.exit(1);
  }
  console.log(`拓曜字幕工作室已啟動：http://127.0.0.1:${PORT}`);
  const llm = llmStatus();
  console.log(llm.ready ? `AI 分析：${llm.label} · ${llm.model}` : `⚠ AI 分析尚未設定：${llm.reason}（翻譯分析步驟會暫停）`);
});
