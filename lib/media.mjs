// 影片處理：ffprobe 讀資訊、ffmpeg 裁切、whisper 聽寫
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => {
      err += d;
      if (onLine) String(d).split(/\r|\n/).filter(Boolean).forEach(onLine);
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${cmd} 失敗（code ${code}）：${err.slice(-600)}`)));
  });
}

// 只處理一般影片檔：擋掉播放清單（hls、concat 等）這類會再去讀其他檔案或網址的格式
export const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
const SAFE_DEMUXERS = new Set(['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2', 'matroska', 'webm', 'avi']);
const LOCAL_ONLY = ['-protocol_whitelist', 'file'];

export async function probe(file) {
  let j;
  try {
    j = JSON.parse(await run('ffprobe', ['-v', 'error', ...LOCAL_ONLY, '-print_format', 'json', '-show_format', '-show_streams', file]));
  } catch {
    throw Object.assign(new Error('無法讀取這個檔案，請確認它是影片檔'), { status: 400 });
  }
  const names = String(j.format?.format_name || '').split(',');
  if (!names.some(n => SAFE_DEMUXERS.has(n))) {
    throw Object.assign(new Error(`不支援的檔案格式（${names.join(', ')}），請用 mp4、mov、mkv、webm 或 avi`), { status: 400 });
  }
  const v = j.streams.find(s => s.codec_type === 'video');
  return {
    demuxer: names[0],
    duration: +j.format.duration,
    width: v?.width, height: v?.height,
    hasAudio: j.streams.some(s => s.codec_type === 'audio'),
  };
}

// 裁出 [start, end] 秒，轉成 1080p H.264 + 16k 單聲道 wav（給 whisper）
// demuxer 固定用 probe 檢查過的格式，避免 ffmpeg 自動改用其他解讀方式
export async function cutClip(src, dir, start, end, demuxer, onLine) {
  const clip = join(dir, 'clip.mp4'), wav = join(dir, 'clip.wav');
  const input = [...LOCAL_ONLY, ...(demuxer ? ['-f', demuxer] : []), '-i', src];
  await run('ffmpeg', ['-hide_banner', '-y', '-ss', String(start), ...input, '-t', String(end - start),
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', clip], { onLine });
  await run('ffmpeg', ['-hide_banner', '-y', '-i', clip, '-ar', '16000', '-ac', '1', wav]);
  return { clip, wav };
}

// whisper 逐字時間軸 → [{ word, start, end }]
export async function transcribe(wav, dir, onLine) {
  const model = process.env.WHISPER_MODEL || 'medium.en';
  await run('whisper', [wav, '--model', model, '--language', 'en', '--word_timestamps', 'True',
    '--output_format', 'json', '--output_dir', dir, '--verbose', 'False'], { onLine });
  const j = JSON.parse(await readFile(join(dir, 'clip.json'), 'utf8'));
  return j.segments.flatMap(s => s.words.map(w => ({
    word: w.word.trim(),
    start: +w.start.toFixed(2),
    end: +w.end.toFixed(2),
  }))).filter(w => w.word);
}
