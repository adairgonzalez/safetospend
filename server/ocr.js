const path = require('path');
const Tesseract = require('tesseract.js');

// English language data is bundled locally via the @tesseract.js-data/eng
// npm package instead of tesseract.js's default behavior of fetching it
// from cdn.jsdelivr.net on first use - keeps this working offline and
// avoids a runtime dependency on a third-party CDN staying up.
const LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let workerPromise = null;
function getWorker() {
  if (!workerPromise) workerPromise = Tesseract.createWorker('eng', 1, { langPath: LANG_PATH });
  return workerPromise;
}

// Accepts a data URL (e.g. "data:image/jpeg;base64,...") and returns the
// extracted text, trimmed. Throws on malformed input or an oversized image.
async function extractTextFromDataUrl(dataUrl) {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Image must be a base64 data URL');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large (max 8MB)');
  const worker = await getWorker();
  const { data: { text } } = await worker.recognize(buffer);
  return text.trim();
}

module.exports = { extractTextFromDataUrl };
