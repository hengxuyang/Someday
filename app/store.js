import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
};

export function detectType(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|mif1|msf1)/.test(buf.toString('latin1', 8, 12))) return 'image/heic';
  return null;
}

export class Store {
  constructor(root) {
    this.root = root;
    this.dataFile = path.join(root, 'data', 'items.json');
    this.imageDir = path.join(root, 'images');
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
    await fs.mkdir(this.imageDir, { recursive: true });
    try {
      await fs.access(this.dataFile);
    } catch {
      await this.#write([]);
    }
  }

  async #read() {
    return JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
  }

  async #write(items) {
    const tmp = `${this.dataFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(items, null, 2));
    await fs.rename(tmp, this.dataFile);
  }

  // Serialise read-modify-write cycles so concurrent requests can't clobber each other.
  #locked(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  list() {
    return this.#locked(async () => (await this.#read()).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async add(buf, originalFilename) {
    const mime = detectType(buf);
    if (!mime) {
      const err = new Error('Unsupported or corrupt image');
      err.status = 415;
      throw err;
    }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return this.#locked(async () => {
      const items = await this.#read();
      const dup = items.find((i) => i.hash === hash);
      if (dup) return { item: dup, duplicate: true };

      const id = hash.slice(0, 12);
      const imageName = `${id}${EXT_BY_TYPE[mime]}`;
      await fs.writeFile(path.join(this.imageDir, imageName), buf);
      const now = new Date().toISOString();
      const item = {
        id,
        hash,
        image_path: `images/${imageName}`,
        original_filename: path.basename(originalFilename || 'screenshot'),
        created_at: now,
        updated_at: now,
      };
      items.push(item);
      await this.#write(items);
      return { item, duplicate: false };
    });
  }

  // Deletes only the Someday copy; the user's original is never touched.
  remove(id) {
    return this.#locked(async () => {
      const items = await this.#read();
      const item = items.find((i) => i.id === id);
      if (!item) return false;
      await this.#write(items.filter((i) => i.id !== id));
      await fs.rm(path.join(this.root, item.image_path), { force: true });
      return true;
    });
  }
}
