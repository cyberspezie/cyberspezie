// Builds the scrambled artwork images + LQIP metadata for index.html.
// Every photo gets a ladder of sizes (640 → native resolution); the site loads the
// smallest one that covers the shown width × pixel ratio × zoom. Photos are JPEG q92
// 4:4:4; images that compress well losslessly (screenshots, notes) are lossless WebP.
// Both keep tiles exact, so the reassembly has no seams (lossy WebP/AVIF would bleed).
// Usage: node build-images.js <pptx media dir> <output images dir> <meta json out> [work id]
// Videos: see tools/build-video.sh (the poster = first frame goes through this script)
// (with a work id only that work is rebuilt; merge its keys into ARTWORK_IMAGES)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [MEDIA, OUT, META_OUT, ONLY] = process.argv.slice(2);
const TILE = 32;            // multiple of 8 → JPEG blocks never straddle tiles
const QUALITY = 92;         // portfolio: near-maximum JPEG quality, 4:4:4 (no colour subsampling)
const LADDER = [640, 1280, 1920, 2560];   // long side of each size; + the native size (max NATIVE_MAX)
const NATIVE_MAX = 4096;
const THUMB_LADDER = [640, 1280];         // preview card
const LOSSLESS_RATIO = 1.3; // lossless WebP when it weighs ≤ 1.3× the JPEG (screenshots, notes, graphics)

// Same function as tileOrder() in index.html (must stay identical)
function tileOrder(key, n) {
  let h = 2166136261;
  const s = 'cyberspezie:' + key;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const WORKS = {                         // pptx image numbers; 1–3 = Fig. 01–03, then extras (Fig. 04+)
  'ethereal-burden': [104],             // 104: installation view supplied separately (not in the pptx), copied as image104… into the media dir
  'petri-web': [101, 102, 103],         // 101–103: new photos supplied separately (not in the pptx), copied as image101… into the media dir
  'shadow': [6, 5, 3, 4],                // work id "nero-colante" (files keep the shadow- name)
  'nostalgic-path': [7, 9, 10, 8],
  'met-while-dancing': [18, 15, 13, 17, 16, 12, 19, 14, 11],
  'cablato': [25, 29, 20, 21, 22, 23, 24, 26, 27, 28, 30, 31],
  '705hz': [34, 33, 32, 35],
  'salvato': [37, 36, 38],
  'lost-in-the-net': [41, 40, 39],
  'costellazioni': [42],
  'about': [201],                       // about me portrait (supplied separately, copied as image201…); no card thumb
  'cablato-process': [105],             // "process" (behind the scenes) of cablato, supplied separately; no card thumb
  'shadow@5': [107, 106],                // "<id>@N": more photos of a work numbered from N, no thumb. nero colante: 05 = first
                                        // frame of the video (poster, 107), 06 = triptych (106); both supplied separately
  'shadow@7': [108],                    // nero colante: 07 = prints + booklet photo (next to the video)
  'cablato@13': [109],                  // cablato: new Fig. 01 (hands + RAM), key cablato-13, first in figures
  'nostalgic-path-process': [110],      // process of nostalgic path (laptop in the studio)
  '705hz-process': [111, 112],          // process of 705Hz: 01 = desk photo, 02 = poster of the video
  'cablato-process@2': [113, 114, 115, 116, 117], // process of cablato 02–05 = set photos, 06 = poster of the video
  'nostalgic-path-process@2': [118],    // process of nostalgic path 02 = photogrammetry desk
  'salvato@4': [119],                   // salvato: poster of the floppy video = new Fig. 01 (key salvato-04, first in figures)
  '705hz-process@3': [120],             // process of 705Hz 03 = poster of the behind-the-scenes video (with sound)
  'met-while-dancing@10': [121],        // met while dancing: collage = new Fig. 00 in the page (key met-while-dancing-10); the card stays the same
  'cablato-process@7': [122],           // process of cablato: poster of the second video (key cablato-process-07, shown as Process 02)
  'ethereal-burden@2': [123],           // ethereal burden: poster of the presentation video = new Fig. 00 (key ethereal-burden-02, first in figures)
  'ethereal-burden@3': [124],           // ethereal burden: poster of the reel (vertical video, Fig. 02)
  'ethereal-burden@4': [125],           // ethereal burden: poster of the "how it works" video (Fig. 03)
  'ethereal-burden-process': [126, 127, 128], // process of ethereal burden: posters of three silent videos (soldering, carpentry, cables)
  'ethereal-burden@5': [129],           // ethereal burden: poster of the small decorative video (glowing light)
  '705hz@5': [130],                     // 705Hz: poster of the performance video with sound = new Fig. 00 (key 705hz-05, first in figures)
  'petri-web@4': [131]                  // petri web: poster of the screen recording (silent) = new Fig. 00 (key petri-web-04, first in figures)
};
const NO_THUMB = new Set(['about', 'cablato-process', 'nostalgic-path-process', '705hz-process', 'ethereal-burden-process']);

function source(n) {
  const f = fs.readdirSync(MEDIA).find(x => x.startsWith(`image${n}.`));
  return path.join(MEDIA, f);
}

async function resized(src, longSide) {
  const { data, info } = await sharp(src)
    .rotate()
    .flatten({ background: '#000000' })
    .resize({ width: longSide, height: longSide, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// Tile-scrambled raw pixels (padded to whole tiles with black)
function scramble({ data, w, h }, relPath) {
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const pw = cols * TILE;
  const ph = rows * TILE;
  const padded = Buffer.alloc(pw * ph * 3);
  for (let y = 0; y < h; y++) data.copy(padded, y * pw * 3, y * w * 3, (y + 1) * w * 3);
  const out = Buffer.alloc(pw * ph * 3);
  const order = tileOrder(relPath, cols * rows);
  for (let j = 0; j < order.length; j++) {
    const o = order[j];                                   // scrambled slot j holds original tile o
    const sx = (o % cols) * TILE, sy = Math.floor(o / cols) * TILE;
    const dx = (j % cols) * TILE, dy = Math.floor(j / cols) * TILE;
    for (let r = 0; r < TILE; r++) {
      const s0 = ((sy + r) * pw + sx) * 3;
      padded.copy(out, ((dy + r) * pw + dx) * 3, s0, s0 + TILE * 3);
    }
  }
  return sharp(out, { raw: { width: pw, height: ph, channels: 3 } });
}

const encodeJpeg = img => img.jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true, progressive: false }).toBuffer();
const encodeLossless = img => img.webp({ lossless: true, effort: 6 }).toBuffer();

// Lossless or JPEG, decided once per image on its native size
async function chooseFormat(src) {
  const px = await resized(src, NATIVE_MAX);
  const img = () => sharp(px.data, { raw: { width: px.w, height: px.h, channels: 3 } });
  const [jpg, webp] = await Promise.all([encodeJpeg(img()), encodeLossless(img())]);
  return webp.length <= jpg.length * LOSSLESS_RATIO ? 'webp' : 'jpg';
}

// Writes one scrambled size; returns its metadata (v = content hash, used as ?v= cache busting)
async function writeSize(src, longSide, base, label, format) {
  const px = await resized(src, longSide);
  const relPath = `images/${base}-${label}.${format}`;
  const buf = await (format === 'webp' ? encodeLossless : encodeJpeg)(scramble(px, relPath));
  fs.writeFileSync(path.join(OUT, path.basename(relPath)), buf);
  const v = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  return { src: relPath, w: px.w, h: px.h, v };
}

// All sizes of one image: the ladder steps smaller than the native size, then the native size
async function writeLadder(src, base, ladder, format, withNative) {
  const meta = await sharp(src).rotate().metadata();
  const native = Math.min(NATIVE_MAX, Math.max(meta.autoOrient ? meta.autoOrient.width : meta.width, meta.autoOrient ? meta.autoOrient.height : meta.height));
  const steps = ladder.filter(l => l < native * 0.9);
  const sizes = [];
  for (const l of steps) sizes.push(await writeSize(src, l, base, l, format));
  if (withNative || !steps.length) sizes.push(await writeSize(src, native, base, 'full', format));
  return sizes;
}

async function lqip(src) {
  const buf = await sharp(src).rotate().flatten({ background: '#000000' })
    .resize({ width: 24, height: 24, fit: 'inside' })
    .jpeg({ quality: 50 }).toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = {};
  for (const [id, nums] of Object.entries(WORKS)) {
    if (ONLY && id !== ONLY) continue;
    const [base, from] = id.split('@');
    for (let i = 0; i < nums.length; i++) {
      const src = source(nums[i]);
      const num = String((from ? +from : 1) + i).padStart(2, '0');
      const format = await chooseFormat(src);
      const sizes = await writeLadder(src, `${base}-${num}`, LADDER, format, true);
      meta[`images/${base}-${num}.jpg`] = { lqip: await lqip(src), sizes };   // key = id only, files carry their own format
      console.log(base, num, format, sizes.map(s => s.w + 'x' + s.h).join(' '));
    }
    if (from || NO_THUMB.has(id)) continue;
    const src = source(nums[0]);
    const format = await chooseFormat(src);
    const thumbs = await writeLadder(src, `${id}-thumb`, THUMB_LADDER, format, false);
    meta[`images/${id}-thumb.jpg`] = { lqip: meta[`images/${id}-01.jpg`].lqip, sizes: thumbs };
  }
  fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 0));
  console.log(Object.keys(meta).length, 'entries');
})();
