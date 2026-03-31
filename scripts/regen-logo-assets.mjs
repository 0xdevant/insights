/**
 * Regenerates public/logo-header.webp and src/app/icon*.png from
 * public/logo.png — edge-median background removal + trim (handles large PNGs).
 *
 * Run: npm run regen-logo-assets
 */
import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "public/logo.png");
const headerOut = join(root, "public/logo-header.webp");
const appDir = join(root, "src/app");

const TOL = 42;
const TOL2 = TOL * TOL;
const ANALYZE = 512;
const WORK_MAX = 1200;

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Median RGB from all edge pixels (matches prior Python behaviour). */
function edgeMedianRgb(data, w, h) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let x = 0; x < w; x++) {
    let i = x * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
    i = ((h - 1) * w + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }
  for (let y = 0; y < h; y++) {
    let i = (y * w) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
    i = (y * w + (w - 1)) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function dematteInPlace(data, w, h, bg) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bg.r;
      const dg = data[i + 1] - bg.g;
      const db = data[i + 2] - bg.b;
      if (dr * dr + dg * dg + db * db < TOL2) {
        data[i + 3] = 0;
      }
    }
  }
}

function bboxAlpha(data, w, h, alphaThresh = 8) {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > alphaThresh) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function main() {
  const raw = readFileSync(srcPath);
  const meta = await sharp(raw).metadata();
  console.log("source", meta.width, meta.height, meta.format);

  const { data: d1, info: i1 } = await sharp(raw)
    .resize(ANALYZE, ANALYZE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const aw = i1.width;
  const ah = i1.height;
  const buf1 = Buffer.from(d1);
  const bg1 = edgeMedianRgb(buf1, aw, ah);
  dematteInPlace(buf1, aw, ah, bg1);
  const box1 = bboxAlpha(buf1, aw, ah);
  if (!box1) {
    throw new Error("No content after de-matte (check logo file).");
  }

  const sx = meta.width / aw;
  const sy = meta.height / ah;
  const pad = 2;
  const left = Math.max(0, Math.floor(box1.left * sx) - pad);
  const top = Math.max(0, Math.floor(box1.top * sy) - pad);
  const width = Math.min(meta.width - left, Math.ceil(box1.width * sx) + pad * 2);
  const height = Math.min(meta.height - top, Math.ceil(box1.height * sy) + pad * 2);

  let cropped = await sharp(raw).extract({ left, top, width, height }).ensureAlpha().toBuffer();
  let cm = await sharp(cropped).metadata();

  if (cm.width > WORK_MAX || cm.height > WORK_MAX) {
    const { data: d2, info: i2 } = await sharp(cropped)
      .resize(WORK_MAX, WORK_MAX, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ww = i2.width;
    const wh = i2.height;
    const buf2 = Buffer.from(d2);
    const bg2 = edgeMedianRgb(buf2, ww, wh);
    dematteInPlace(buf2, ww, wh, bg2);
    const box2 = bboxAlpha(buf2, ww, wh);
    if (box2) {
      const scaleX = cm.width / ww;
      const scaleY = cm.height / wh;
      const el = Math.max(0, Math.floor(box2.left * scaleX) - 1);
      const et = Math.max(0, Math.floor(box2.top * scaleY) - 1);
      const ew = Math.min(cm.width - el, Math.ceil(box2.width * scaleX) + 2);
      const eh = Math.min(cm.height - et, Math.ceil(box2.height * scaleY) + 2);
      cropped = await sharp(cropped).extract({ left: el, top: et, width: ew, height: eh }).ensureAlpha().toBuffer();
      cm = await sharp(cropped).metadata();
    }
  }

  const headerMaxW = 400;
  const hw = Math.min(headerMaxW, cm.width);
  const hh = Math.round((cm.height * hw) / cm.width);
  await sharp(cropped).resize(hw, hh).webp({ quality: 86, effort: 6 }).toFile(headerOut);
  console.log("header webp", hw, hh, headerOut);

  mkdirSync(appDir, { recursive: true });
  const side = Math.max(cm.width, cm.height);
  const ox = Math.floor((side - cm.width) / 2);
  const oy = Math.floor((side - cm.height) / 2);

  const padded = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left: ox, top: oy }])
    .png()
    .toBuffer();

  await sharp(padded).resize(48, 48).png({ compressionLevel: 9 }).toFile(join(appDir, "icon.png"));
  await sharp(padded).resize(180, 180).png({ compressionLevel: 9 }).toFile(join(appDir, "apple-icon.png"));
  console.log("icons", join(appDir, "icon.png"), join(appDir, "apple-icon.png"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
