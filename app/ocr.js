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

const SDK_DIRS = [
  '/Library/Developer/CommandLineTools/SDKs',
  '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs',
];

// SDKs to try, in order: an explicit override, the toolchain default (null), then every
// installed macOS SDK newest-first. A beta/newer SDK than the compiler breaks the default build,
// and an older installed SDK usually still works.
export async function sdkCandidates(env = process.env, dirs = SDK_DIRS) {
  const found = [];
  for (const dir of dirs) {
    for (const name of await fs.readdir(dir).catch(() => [])) {
      if (/^MacOSX.*\.sdk$/.test(name)) found.push(path.join(dir, name));
    }
  }
  const real = await Promise.all(found.map((f) => fs.realpath(f).catch(() => f)));
  const unique = [...new Set(real)].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return [...(env.SOMEDAY_SDK ? [env.SOMEDAY_SDK] : []), null, ...unique];
}

// Boil a wall of compiler output down to the lines that explain the failure.
export function summariseCompileError(stderr) {
  const lines = String(stderr).split('\n').filter((l) => /error:/.test(l));
  const mismatch = lines.find((l) => /SDK is not supported by the compiler/.test(l));
  return (mismatch || lines.slice(0, 3).join('\n') || String(stderr)).replace(/^\S+?:\d+:\d+: /, '').trim().slice(0, 600);
}

async function compileVision() {
  let firstError = '';
  for (const sdk of await sdkCandidates()) {
    try {
      await run('swiftc', ['-O', ...(sdk ? ['-sdk', sdk] : []), SWIFT_SRC, '-o', SWIFT_BIN], { timeout: 300_000 });
      return;
    } catch (err) {
      firstError ||= summariseCompileError(err.stderr || err.message);
    }
  }
  throw new Error(
    `Could not build the Apple Vision helper with any installed macOS SDK: ${firstError}\n` +
    'Usually the Command Line Tools are out of sync. Update them in System Settings > Software Update, or reinstall: ' +
    '"sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install". ' +
    'To force a specific SDK, set SOMEDAY_SDK=/path/to/MacOSX.sdk.',
  );
}

// Compile the Swift helper once; later runs use the binary and skip Swift's slow startup.
async function visionBinary() {
  // Reuse the binary unless the Swift source changed since it was built.
  const [src, bin] = await Promise.all([fs.stat(SWIFT_SRC), fs.stat(SWIFT_BIN).catch(() => null)]);
  if (bin && bin.mtimeMs >= src.mtimeMs) return SWIFT_BIN;
  if (process.platform !== 'darwin' || !(await hasCommand('swiftc'))) return null;
  await fs.mkdir(path.dirname(SWIFT_BIN), { recursive: true });
  // Don't quietly fall back to tesseract on failure: it is Latin-only and much worse.
  await compileVision();
  return SWIFT_BIN;
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
