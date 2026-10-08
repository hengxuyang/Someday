import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const SWIFT_SRC = path.join(here, 'ocr', 'vision-ocr.swift');
const SWIFT_BIN = path.join(here, 'ocr', '.build', 'vision-ocr');
const OPTS = { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 };

async function hasCommand(cmd) {
  return run('which', [cmd]).then(() => true, () => false);
}

// Compile the Swift helper once; later runs use the binary and skip Swift's slow startup.
async function visionBinary() {
  // Reuse the binary unless the Swift source changed since it was built.
  const [src, bin] = await Promise.all([fs.stat(SWIFT_SRC), fs.stat(SWIFT_BIN).catch(() => null)]);
  if (bin && bin.mtimeMs >= src.mtimeMs) return SWIFT_BIN;
  if (process.platform !== 'darwin' || !(await hasCommand('swiftc'))) return null;
  await fs.mkdir(path.dirname(SWIFT_BIN), { recursive: true });
  try {
    await run('swiftc', ['-O', SWIFT_SRC, '-o', SWIFT_BIN], { timeout: 300_000 });
    return SWIFT_BIN;
  } catch {
    return null;
  }
}

// Returns { text } on success, or throws if no OCR engine is available or it fails.
// Prefers Apple Vision (macOS); falls back to tesseract if installed.
export async function ocrImage(imagePath) {
  const bin = await visionBinary();
  if (bin) return { engine: 'vision', text: (await run(bin, [imagePath], OPTS)).stdout.trim() };
  if (await hasCommand('tesseract')) {
    return { engine: 'tesseract', text: (await run('tesseract', [imagePath, 'stdout'], OPTS)).stdout.trim() };
  }
  throw new Error('No OCR engine available (needs macOS with Xcode command line tools, or tesseract)');
}
