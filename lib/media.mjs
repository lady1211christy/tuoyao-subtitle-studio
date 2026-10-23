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

export async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(out);
  const v = j.streams.find(s => s.codec_type === 'video');
  return {
    duration: +j.format.duration,
    width: v?.width, height: v?.height,
    hasAudio: j.streams.some(s => s.codec_type === 'audio'),
  };
}

// 裁出 [start, end] 秒，轉成 1080p H.264 + 16k 單聲道 wav（給 whisper）
export async function cutClip(src, dir, start, end, onLine) {
  const clip = join(dir, 'clip.mp4'), wav = join(dir, 'clip.wav');
  await run('ffmpeg', ['-hide_banner', '-y', '-ss', String(start), '-i', src, '-t', String(end - start),
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
