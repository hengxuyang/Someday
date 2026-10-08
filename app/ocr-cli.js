// Debug helper: node app/ocr-cli.js <image>  (or: npm run ocr -- <image>)
// Shows which OCR engine is used and the raw text it produces.
import { ocrImage } from './ocr.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run ocr -- <image-path>');
  process.exit(2);
}
try {
  const { engine, text } = await ocrImage(file);
  console.log(`engine: ${engine}\n---\n${text}`);
} catch (err) {
  console.error(`OCR error: ${err.message}`);
  process.exit(1);
}
