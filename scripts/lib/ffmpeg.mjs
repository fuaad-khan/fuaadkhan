// ffmpeg location and run helpers: env FFMPEG, else the build bundled with mapMyCity's video studio (FFmpeg 2018, no ffprobe)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const BUNDLED = 'C:\\dev\\mapMyCity\\video\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe'

// Resolves the ffmpeg executable: env FFMPEG (quotes stripped), the bundled studio build, then ffmpeg on PATH
export function resolveFfmpeg() {
  const fromEnv = process.env.FFMPEG?.trim().replace(/^(["'])(.*)\1$/, '$2')
  if (fromEnv) {
    if (existsSync(fromEnv) || !/[\\/]/.test(fromEnv)) return fromEnv
    throw new Error(`FFMPEG points at a missing file: ${fromEnv}`)
  }
  return existsSync(BUNDLED) ? BUNDLED : 'ffmpeg'
}

// Runs ffmpeg to completion and resolves { code, stderr }; rejects on a non-zero exit unless allowFail
export function run(args, { allowFail = false } = {}) {
  const bin = resolveFfmpeg()
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-200000)
    })
    child.once('error', (err) => reject(new Error(`Could not start ffmpeg (${bin}): ${err.message}`)))
    child.once('close', (code) => {
      if (code === 0 || allowFail) resolvePromise({ code, stderr })
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-3000)}`))
    })
  })
}

// Reads width, height and duration from ffmpeg's input banner (this build has no ffprobe)
export async function probe(file) {
  const { stderr } = await run(['-i', file], { allowFail: true })
  const size = /Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr)
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr)
  return {
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    duration: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
  }
}

// Lossy WebP at a target width (lanczos), 4:2:0 with no alpha so opaque captures carry no alpha plane
export const webp = (input, output, { width, quality = 82 }) =>
  run(['-y', '-i', input, '-vf', `scale=${width}:-2:flags=lanczos`, '-pix_fmt', 'yuv420p', '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', '-an', output])

// Frame sequence (printf pattern) to a muted VP9 WebM at 30 fps, PLAN §7 settings with a variable CRF
export const webm = (pattern, output, { width = 1280, fps = 30, crf = 34 } = {}) =>
  run(['-y', '-framerate', String(fps), '-i', pattern, '-vf', `scale=${width}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', output])

// Frame sequence to a muted, fast-start H.264 MP4 at 30 fps, PLAN §7 settings with a variable CRF
export const mp4 = (pattern, output, { width = 1280, fps = 30, crf = 26 } = {}) =>
  run(['-y', '-framerate', String(fps), '-i', pattern, '-vf', `scale=${width}:-2:flags=lanczos`, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output])

// Two-pass VBR at a target bitrate (kbps), for clips whose CRF encode overshoots a size budget; codec 'vp9' or 'h264'
export async function twoPass(pattern, output, { codec, kbps, width = 1280, fps = 30, passlog }) {
  const input = ['-framerate', String(fps), '-i', pattern, '-vf', `scale=${width}:-2:flags=lanczos,format=yuv420p`]
  const rate = ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 2)}k`, '-bufsize', `${Math.round(kbps * 4)}k`]
  const enc = codec === 'vp9'
    ? ['-c:v', 'libvpx-vp9', ...rate, '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2']
    : ['-c:v', 'libx264', '-preset', 'slow', ...rate, '-pix_fmt', 'yuv420p']
  await run(['-y', ...input, ...enc, '-pass', '1', '-passlogfile', passlog, '-an', '-f', 'null', '-'])
  await run(['-y', ...input, ...enc, '-pass', '2', '-passlogfile', passlog, '-an', ...(codec === 'vp9' ? [] : ['-movflags', '+faststart']), output])
}

// Counts decoded video frames by null-decoding the file
export async function countFrames(file) {
  const { stderr } = await run(['-i', file, '-map', '0:v:0', '-f', 'null', '-'], { allowFail: true })
  const all = [...stderr.matchAll(/frame=\s*(\d+)/g)]
  return all.length ? Number(all.at(-1)[1]) : 0
}
