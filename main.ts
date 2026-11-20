// The world on Thursday 19 November 2026, in one picture.
//
// Node 22, standard library only. Everything is drawn from code: an anti-aliased polygon
// rasterizer, a hand-made stroke font, vector illustrations and a small PNG encoder.
// No clock, no randomness, no network: every run writes the same bytes to
// $MAKEFUN_OUTPUT_DIR/entry.png (default /output/entry.png).
//
// The file is plain JavaScript syntax so it runs on any Node 22 release, with or without
// TypeScript type stripping.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const px = new Float32Array(W * H * 3);

// ---------------------------------------------------------------- colour & clip

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let clip = { x0: 0, y0: 0, x1: W, y1: H };
function setClip(x, y, w, h) {
  clip = { x0: Math.max(0, Math.floor(x)), y0: Math.max(0, Math.floor(y)), x1: Math.min(W, Math.ceil(x + w)), y1: Math.min(H, Math.ceil(y + h)) };
}
function resetClip() { clip = { x0: 0, y0: 0, x1: W, y1: H }; }

function blend(x, y, c, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  const i = (y * W + x) * 3;
  px[i] += (c[0] - px[i]) * a;
  px[i + 1] += (c[1] - px[i + 1]) * a;
  px[i + 2] += (c[2] - px[i + 2]) * a;
}

// ---------------------------------------------------------------- polygons (nonzero, 5x vertical supersampling, exact horizontal coverage)

function fillPoly(rings, color, alpha) {
  if (alpha === undefined) alpha = 1;
  const c = typeof color === 'string' ? rgb(color) : color;
  const edges = [];
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
      if (p[1] === q[1]) continue;
      edges.push(p[0], p[1], q[0], q[1]);
    }
  }
  const x0 = Math.max(clip.x0, Math.floor(minx)), x1 = Math.min(clip.x1 - 1, Math.ceil(maxx));
  const y0 = Math.max(clip.y0, Math.floor(miny)), y1 = Math.min(clip.y1 - 1, Math.ceil(maxy));
  if (x1 < x0 || y1 < y0) return;
  const cov = new Float32Array(x1 - x0 + 2);
  const SS = 5;
  const xs = [];
  const add = (xa, xb, w) => {
    if (xa < x0) xa = x0; if (xb > x1 + 1) xb = x1 + 1;
    if (xb <= xa) return;
    const ia = Math.floor(xa), ib = Math.floor(xb);
    if (ia === ib) { cov[ia - x0] += (xb - xa) * w; return; }
    cov[ia - x0] += (ia + 1 - xa) * w;
    for (let k = ia + 1; k < ib; k++) cov[k - x0] += w;
    if (ib - x0 < cov.length) cov[ib - x0] += (xb - ib) * w;
  };
  for (let y = y0; y <= y1; y++) {
    cov.fill(0);
    let hit = false;
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      xs.length = 0;
      for (let e = 0; e < edges.length; e += 4) {
        const ax = edges[e], ay = edges[e + 1], bx = edges[e + 2], by = edges[e + 3];
        const lo = ay < by ? ay : by, hi = ay < by ? by : ay;
        if (sy < lo || sy >= hi) continue;
        xs.push(ax + (sy - ay) * (bx - ax) / (by - ay), ay < by ? 1 : -1);
      }
      if (!xs.length) continue;
      const pairs = [];
      for (let k = 0; k < xs.length; k += 2) pairs.push([xs[k], xs[k + 1]]);
      pairs.sort((a, b) => a[0] - b[0]);
      let wind = 0, start = 0;
      for (const [x, d] of pairs) {
        const before = wind;
        wind += d;
        if (before === 0 && wind !== 0) start = x;
        else if (before !== 0 && wind === 0) { add(start, x, 1 / SS); hit = true; }
      }
    }
    if (!hit) continue;
    for (let x = x0; x <= x1; x++) {
      const a = cov[x - x0];
      if (a > 0.001) blend(x, y, c, Math.min(1, a) * alpha);
    }
  }
}

function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function fillRect(x, y, w, h, color, alpha) { fillPoly([rect(x, y, w, h)], color, alpha); }

function ellipse(cx, cy, rx, ry, a0, a1, n) {
  if (a0 === undefined) { a0 = 0; a1 = Math.PI * 2; }
  if (!n) n = Math.max(16, Math.ceil(Math.max(rx, ry) * 1.2 * Math.abs(a1 - a0) / Math.PI));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function fillCircle(cx, cy, r, color, alpha) { fillPoly([ellipse(cx, cy, r, r)], color, alpha); }
function fillEllipse(cx, cy, rx, ry, color, alpha) { fillPoly([ellipse(cx, cy, rx, ry)], color, alpha); }

function roundRect(x, y, w, h, r) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (const p of ellipse(cx, cy, r, r, a0, a0 + Math.PI / 2, 8)) pts.push(p); };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return pts;
}

function star(cx, cy, r, rot) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.382 : r;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

function rotate(pts, cx, cy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

function vgrad(x, y, w, h, c1, c2) {
  const a = rgb(c1), b = rgb(c2);
  const ys = Math.max(clip.y0, Math.floor(y)), ye = Math.min(clip.y1, Math.ceil(y + h));
  for (let yy = ys; yy < ye; yy++) {
    const t = h <= 1 ? 0 : (yy - y) / (h - 1);
    const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    fillPoly([rect(x, yy, w, 1)], c, 1);
  }
}

// ---------------------------------------------------------------- strokes (distance-field capsules, round caps and joins)

function strokeLines(lines, lw, color, alpha) {
  if (alpha === undefined) alpha = 1;
  const c = typeof color === 'string' ? rgb(color) : color;
  const segs = [];
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const pl of lines) {
    for (const p of pl) {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    if (pl.length === 1) segs.push(pl[0][0], pl[0][1], pl[0][0], pl[0][1]);
    for (let i = 0; i + 1 < pl.length; i++) segs.push(pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]);
  }
  const r = lw / 2;
  const x0 = Math.max(clip.x0, Math.floor(minx - r - 1)), x1 = Math.min(clip.x1 - 1, Math.ceil(maxx + r + 1));
  const y0 = Math.max(clip.y0, Math.floor(miny - r - 1)), y1 = Math.min(clip.y1 - 1, Math.ceil(maxy + r + 1));
  const n = segs.length / 4;
  const pre = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const dx = segs[k * 4 + 2] - segs[k * 4], dy = segs[k * 4 + 3] - segs[k * 4 + 1];
    pre[k * 3] = dx; pre[k * 3 + 1] = dy; pre[k * 3 + 2] = dx * dx + dy * dy;
  }
  const lim = (r + 0.5) * (r + 0.5);
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      let best = 1e18;
      for (let k = 0; k < n; k++) {
        const ax = segs[k * 4], ay = segs[k * 4 + 1];
        const dx = pre[k * 3], dy = pre[k * 3 + 1], l2 = pre[k * 3 + 2];
        let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const ex = ax + dx * t - cx, ey = ay + dy * t - cy;
        const d2 = ex * ex + ey * ey;
        if (d2 < best) best = d2;
      }
      if (best >= lim) continue;
      const cv = r + 0.5 - Math.sqrt(best);
      blend(x, y, c, Math.min(1, cv) * alpha);
    }
  }
}
function line(x0, y0, x1, y1, lw, color, alpha) { strokeLines([[[x0, y0], [x1, y1]]], lw, color, alpha); }

// ---------------------------------------------------------------- stroke font (caps, digits, punctuation); cap height = 10 units

const FONT = {};
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 9));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function def(ch, w, ...strokes) { FONT[ch] = { w, s: strokes }; }

def('A', 7.6, [[0, 10], [3.8, 0], [7.6, 10]], [[1.35, 6.6], [6.25, 6.6]]);
def('B', 6.6, [[0, 5], [3.9, 5], ...arc(3.9, 7.5, 2.7, 2.5, -90, 90), [0, 10], [0, 0], [3.6, 0], ...arc(3.6, 2.5, 2.4, 2.5, -90, 90), [0, 5]]);
def('C', 7.2, arc(4, 5, 4, 5, -42, -318));
def('D', 7.2, [[0, 0], [2.8, 0], ...arc(2.8, 5, 4.4, 5, -90, 90), [0, 10], [0, 0]]);
def('E', 5.8, [[5.8, 0], [0, 0], [0, 10], [5.8, 10]], [[0, 5], [5, 5]]);
def('F', 5.6, [[5.6, 0], [0, 0], [0, 10]], [[0, 5], [4.8, 5]]);
def('G', 7.6, arc(4, 5, 4, 5, -40, -360), [[8, 5.3], [4.6, 5.3]]);
def('H', 6.8, [[0, 0], [0, 10]], [[6.8, 0], [6.8, 10]], [[0, 5], [6.8, 5]]);
def('I', 0, [[0, 0], [0, 10]]);
def('J', 5.2, [[5.2, 0], ...arc(2.65, 7.3, 2.55, 2.7, 0, 165)]);
def('K', 6.6, [[0, 0], [0, 10]], [[6.6, 0], [0, 6.2]], [[2.3, 4.3], [6.8, 10]]);
def('L', 5.6, [[0, 0], [0, 10], [5.6, 10]]);
def('M', 8.4, [[0, 10], [0, 0], [4.2, 6.6], [8.4, 0], [8.4, 10]]);
def('N', 6.8, [[0, 10], [0, 0], [6.8, 10], [6.8, 0]]);
def('O', 8, arc(4, 5, 4, 5, 0, 360));
def('P', 6.6, [[0, 10], [0, 0], [3.8, 0], ...arc(3.8, 2.75, 2.8, 2.75, -90, 90), [0, 5.5]]);
def('Q', 8, arc(4, 5, 4, 5, 0, 360), [[5, 7.2], [8.2, 10.5]]);
def('R', 6.8, [[0, 10], [0, 0], [3.8, 0], ...arc(3.8, 2.75, 2.8, 2.75, -90, 90), [0, 5.5]], [[3.4, 5.5], [6.8, 10]]);
def('S', 6.6, [...arc(3.3, 2.6, 3.1, 2.6, -28, -270), ...arc(3.3, 7.4, 3.3, 2.6, -90, 152)]);
def('T', 7, [[0, 0], [7, 0]], [[3.5, 0], [3.5, 10]]);
def('U', 6.8, [[0, 0], [0, 6.6], ...arc(3.4, 6.6, 3.4, 3.4, 180, 0), [6.8, 0]]);
def('V', 7.6, [[0, 0], [3.8, 10], [7.6, 0]]);
def('W', 10.6, [[0, 0], [2.5, 10], [5.3, 1.6], [8.1, 10], [10.6, 0]]);
def('X', 7, [[0, 0], [7, 10]], [[7, 0], [0, 10]]);
def('Y', 7.4, [[0, 0], [3.7, 5.2], [7.4, 0]], [[3.7, 5.2], [3.7, 10]]);
def('Z', 6.8, [[0, 0], [6.8, 0], [0, 10], [6.8, 10]]);
def('0', 6.4, arc(3.2, 5, 3.2, 5, 0, 360));
def('1', 3.6, [[0.2, 2.2], [3.4, 0], [3.4, 10]]);
def('2', 6.4, [...arc(3.2, 3.1, 3.1, 3.1, -165, 28), [0, 10], [6.4, 10]]);
def('3', 6.4, [...arc(3.1, 2.6, 3, 2.6, -160, 90), ...arc(3.1, 7.4, 3.3, 2.6, -90, 160)]);
def('4', 6.8, [[5, 10], [5, 0], [0, 7], [6.8, 7]]);
def('5', 6.4, [[6, 0], [1, 0], [0.6, 4.6], ...arc(3.2, 6.8, 3.2, 3.2, -128, 155)]);
def('6', 6.4, arc(3.2, 6.8, 3.2, 3.2, 0, 360), [[5.3, 0.3], [0.35, 6]]);
def('7', 6.4, [[0, 0], [6.4, 0], [2.2, 10]]);
def('8', 6.6, arc(3.3, 2.55, 2.8, 2.55, 0, 360), arc(3.3, 7.45, 3.3, 2.55, 0, 360));
def('9', 6.4, arc(3.2, 3.2, 3.2, 3.2, 0, 360), [[6.05, 4.6], [1.4, 10]]);
def('.', 0, [[0, 10]]);
def(',', 1, [[0.9, 9.4], [0, 11.6]]);
def(':', 0, [[0, 3.6]], [[0, 10]]);
def(';', 1, [[0.9, 3.6]], [[0.9, 9.4], [0, 11.6]]);
def('-', 3.8, [[0, 5.7], [3.8, 5.7]]);
def('—', 7.6, [[0, 5.7], [7.6, 5.7]]);
def("'", 0, [[0, 0], [0, 3]]);
def('"', 2.2, [[0, 0], [0, 3]], [[2.2, 0], [2.2, 3]]);
def('/', 4.6, [[0, 10.4], [4.6, -0.4]]);
def('(', 1.8, arc(4.2, 5, 4.2, 6.4, -128, -232));
def(')', 1.8, arc(-2.4, 5, 4.2, 6.4, -52, 52));
def('%', 7.6, [[0.6, 10], [7, 0]], arc(1.6, 2.1, 1.6, 2.1, 0, 360), arc(6, 7.9, 1.6, 2.1, 0, 360));
def('$', 6.6, [...arc(3.3, 2.6, 3.1, 2.6, -28, -270), ...arc(3.3, 7.4, 3.3, 2.6, -90, 152)], [[3.3, -1.3], [3.3, 11.3]]);
def('!', 0, [[0, 0], [0, 6.8]], [[0, 10]]);
def('?', 5.6, [...arc(2.8, 2.9, 2.8, 2.9, -165, 55), [2.8, 6.4], [2.8, 7]], [[2.8, 10]]);
def('+', 6, [[3, 2], [3, 8]], [[0, 5], [6, 5]]);
def('·', 0, [[0, 5.3]]);
def('€', 7.2, arc(4.4, 5, 4.2, 5, -45, -315), [[0, 4], [5, 4]], [[0, 6.2], [5, 6.2]]);

const NORMALISE = { '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-' };

function prepare(str) {
  let out = '';
  for (const ch of str.toUpperCase()) out += NORMALISE[ch] || ch;
  return out;
}

// opts: lw (stroke width px), sx (horizontal condense), track (extra px per glyph)
function advance(ch, size, o) {
  if (ch === ' ') return size * 0.42 + (o.track || 0);
  const g = FONT[ch];
  if (!g) throw new Error('missing glyph ' + JSON.stringify(ch));
  return g.w * size / 10 * o.sx + size * 0.2 + o.lw * 0.95 + (o.track || 0);
}
function measure(str, size, o) {
  str = prepare(str);
  let w = 0;
  for (const ch of str) w += advance(ch, size, o);
  return w - (o.track || 0) - size * 0.2;
}
function drawText(str, x, y, size, color, o) {
  str = prepare(str);
  const u = size / 10;
  if (o.align === 'center') x -= measure(str, size, o) / 2;
  else if (o.align === 'right') x -= measure(str, size, o);
  let cx = x + o.lw / 2;
  for (const ch of str) {
    if (ch !== ' ') {
      const g = FONT[ch];
      const lines = g.s.map(pl => pl.map(p => [cx + p[0] * u * o.sx, y + p[1] * u]));
      strokeLines(lines, o.lw, color);
    }
    cx += advance(ch, size, o);
  }
}
function wrap(str, size, o, maxW) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && measure(t, size, o) > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(str, x, y, size, color, o, maxW, leading) {
  const lines = wrap(str, size, o, maxW);
  lines.forEach((l, i) => drawText(l, x, y + i * leading, size, color, o));
  return y + lines.length * leading;
}

// ---------------------------------------------------------------- palette & type styles

const PAPER = '#f3eee4', CARD = '#fbf9f4', INK = '#141922', MUTED = '#454b57', RED = '#c3122f', NAVY = '#12223a', GOLD = '#e7b44c';
const HEAD = (s) => ({ lw: s * 0.175, sx: 0.84 });
const BODY = (s) => ({ lw: Math.max(1.25, s * 0.125), sx: 0.86 });
const KICK = (s) => ({ lw: Math.max(1.2, s * 0.14), sx: 0.9, track: 1.4 });

// ---------------------------------------------------------------- illustrations

function flagUS(x, y, w, h) {
  for (let i = 0; i < 13; i++) fillRect(x, y + i * h / 13, w, h / 13 + 0.02, i % 2 ? '#ffffff' : '#b22234');
  const cw = w * 0.42, ch = h * 7 / 13;
  fillRect(x, y, cw, ch, '#3c3b6e');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) fillCircle(x + cw * (c + 0.5) / 5, y + ch * (r + 0.5) / 4, Math.max(0.9, h * 0.022), '#ffffff');
}
function flagCN(x, y, w, h) {
  fillRect(x, y, w, h, '#de2910');
  const u = h / 20;
  fillPoly([star(x + 5 * u, y + 5 * u, 3 * u)], '#ffde00');
  const small = [[10, 2], [12, 4], [12, 7], [10, 9]];
  for (const [sx, sy] of small) fillPoly([star(x + sx * u, y + sy * u, u, Math.atan2(sy - 5, sx - 5) + Math.PI / 2)], '#ffde00');
}
function flagRU(x, y, w, h) {
  fillRect(x, y, w, h / 3, '#ffffff');
  fillRect(x, y + h / 3, w, h / 3, '#0039a6');
  fillRect(x, y + 2 * h / 3, w, h / 3, '#d52b1e');
}
function flagUA(x, y, w, h) { fillRect(x, y, w, h / 2, '#0057b7'); fillRect(x, y + h / 2, w, h / 2, '#ffd700'); }
function flagCO(x, y, w, h) { fillRect(x, y, w, h / 2, '#fcd116'); fillRect(x, y + h / 2, w, h / 4, '#003893'); fillRect(x, y + 3 * h / 4, w, h / 4, '#ce1126'); }
function flagSA(x, y, w, h) { fillRect(x, y, w, h, '#006c35'); line(x + w * 0.2, y + h * 0.42, x + w * 0.8, y + h * 0.42, h * 0.08, '#ffffff'); line(x + w * 0.25, y + h * 0.7, x + w * 0.75, y + h * 0.7, h * 0.05, '#ffffff'); }

function person(cx, baseY, scale, tie, hair) {
  const s = scale;
  // shoulders / suit
  fillPoly([[...ellipse(cx, baseY - 6 * s, 36 * s, 34 * s, Math.PI, Math.PI * 2, 24), [cx + 36 * s, baseY + 20 * s], [cx - 36 * s, baseY + 20 * s]]], '#1d2230');
  // shirt + tie
  fillPoly([[[cx - 9 * s, baseY - 38 * s], [cx + 9 * s, baseY - 38 * s], [cx, baseY - 10 * s]]], '#f2f2f2');
  fillPoly([[[cx - 3 * s, baseY - 34 * s], [cx + 3 * s, baseY - 34 * s], [cx + 4 * s, baseY - 14 * s], [cx, baseY - 9 * s], [cx - 4 * s, baseY - 14 * s]]], tie);
  // neck + head
  fillRect(cx - 7 * s, baseY - 48 * s, 14 * s, 12 * s, '#d9a98a');
  fillEllipse(cx, baseY - 62 * s, 15 * s, 18 * s, '#e4b597');
  // hair: a simple cap over the top of the head, styled per figure
  const hy = baseY - 62 * s;
  if (hair.style === 'swept') {
    fillPoly([[...ellipse(cx, hy - 2 * s, 16.5 * s, 17 * s, Math.PI * 1.02, Math.PI * 1.98, 16), [cx + 17 * s, hy - 4 * s], [cx + 8 * s, hy - 9 * s], [cx - 12 * s, hy - 8 * s], [cx - 16 * s, hy - 1 * s]]], hair.color);
  } else if (hair.style === 'neat') {
    fillPoly([[...ellipse(cx, hy - 1 * s, 15.8 * s, 18.5 * s, Math.PI * 1.0, Math.PI * 2.0, 16), [cx + 15 * s, hy - 6 * s], [cx - 6 * s, hy - 11 * s], [cx - 15 * s, hy - 4 * s]]], hair.color);
  } else {
    fillPoly([ellipse(cx, hy - 3 * s, 14.5 * s, 15.5 * s, Math.PI * 1.08, Math.PI * 1.92, 12)], hair.color, 0.75);
  }
  // eyes, so the heads read as people at a glance
  fillCircle(cx - 5 * s, hy + 1 * s, 1.5 * s, '#3a2a22');
  fillCircle(cx + 5 * s, hy + 1 * s, 1.5 * s, '#3a2a22');
}

function leadArt(x, y, w, h) {
  setClip(x, y, w, h);
  const hz = y + h * 0.56;
  vgrad(x, y, w, hz - y, '#1b2b4d', '#f0a35e');
  // Shenzhen skyline
  const sky = [[0, 40], [22, 58], [40, 34], [58, 70], [80, 48], [96, 90], [118, 62], [140, 40], [160, 76], [184, 54], [204, 44], [226, 84], [250, 60], [276, 38], [300, 72], [324, 52], [350, 96], [374, 64], [398, 44], [420, 80], [446, 56], [470, 36], [490, 66]];
  for (const [ox, hh] of sky) fillRect(x + ox, hz - hh, 26, hh + 2, '#33304a');
  // Ping An-style supertall with spire
  const tx = x + w * 0.86;
  fillPoly([[[tx - 14, hz], [tx - 10, hz - 150], [tx - 4, hz - 168], [tx + 4, hz - 168], [tx + 10, hz - 150], [tx + 14, hz]]], '#2a2740');
  line(tx, hz - 168, tx, hz - 196, 2, '#2a2740');
  // floor
  vgrad(x, hz, w, y + h - hz, '#6b2124', '#3b0f13');
  // flags on poles
  const fx = [x + w * 0.22, x + w * 0.5, x + w * 0.78];
  const fw = 84, fh = 54, fy = y + 22;
  const flags = [flagUS, flagCN, flagRU];
  for (let i = 0; i < 3; i++) {
    line(fx[i] - fw / 2 - 3, fy - 6, fx[i] - fw / 2 - 3, hz + 6, 3, '#c9c3b8');
    fillCircle(fx[i] - fw / 2 - 3, fy - 7, 3.5, GOLD);
    flags[i](fx[i] - fw / 2, fy, fw, fh);
  }
  // leaders (generic silhouettes) behind the table
  const ties = ['#c3122f', '#b0151a', '#24418f'];
  const hair = [{ style: 'swept', color: '#e2c06a' }, { style: 'neat', color: '#1b1b1f' }, { style: 'thin', color: '#c9b9a0' }];
  for (let i = 0; i < 3; i++) person(fx[i], y + h * 0.66, 1.05, ties[i], hair[i]);
  // table
  const ty = y + h * 0.7;
  fillRect(x + 18, ty, w - 36, 9, '#f5f2ea');
  fillRect(x + 18, ty + 9, w - 36, y + h - ty - 18, '#173a6e');
  drawText('APEC 2026 · SHENZHEN', x + w / 2, ty + 26, 15, '#ffffff', { lw: 2.1, sx: 0.9, track: 2, align: 'center' });
  // name cards and microphones
  const names = ['TRUMP', 'XI', 'PUTIN'];
  for (let i = 0; i < 3; i++) {
    line(fx[i] + 26, ty, fx[i] + 14, ty - 30, 2, '#222');
    fillEllipse(fx[i] + 13, ty - 32, 4, 6, '#222');
    fillPoly([[[fx[i] - 34, ty - 2], [fx[i] + 34, ty - 2], [fx[i] + 30, ty - 24], [fx[i] - 30, ty - 24]]], '#ffffff');
    drawText(names[i], fx[i], ty - 19, 12, INK, { lw: 2, sx: 0.88, align: 'center' });
  }
  resetClip();
}

function icjArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h, '#5b1a2a', '#2c0b14');
  const cx = x + w * 0.62, top = y + 18;
  const g = GOLD;
  // scales of justice
  line(cx, top + 6, cx, y + h - 22, 5, g);
  fillPoly([[[cx - 30, y + h - 12], [cx + 30, y + h - 12], [cx + 18, y + h - 24], [cx - 18, y + h - 24]]], g);
  line(cx - 62, top + 18, cx + 62, top + 18, 4, g);
  fillCircle(cx, top + 8, 7, g);
  for (const sx of [-1, 1]) {
    const px0 = cx + sx * 58, dip = sx < 0 ? 14 : 0;
    line(px0, top + 18, px0 - 22, top + 62 + dip, 1.6, g);
    line(px0, top + 18, px0 + 22, top + 62 + dip, 1.6, g);
    fillPoly([ellipse(px0, top + 62 + dip, 27, 13, 0, Math.PI, 16)], g);
  }
  // gavel
  const gx = x + w * 0.2, gy = y + h * 0.62;
  fillPoly([rotate(rect(gx - 30, gy - 11, 60, 22), gx, gy, -0.5)], '#8a5a2b');
  fillPoly([rotate(rect(gx - 3, gy - 2, 8, 56), gx, gy, -0.5)], '#6b4421');
  fillPoly([rotate(rect(gx - 33, gy - 13, 8, 26), gx, gy, -0.5)], '#c99a4a');
  fillPoly([rotate(rect(gx + 25, gy - 13, 8, 26), gx, gy, -0.5)], '#c99a4a');
  fillRect(gx - 34, y + h - 18, 64, 9, '#6b4421');
  drawText('9-6', x + 14, y + 14, 26, '#ffffff', { lw: 4, sx: 0.85 });
  drawText('RULING', x + 15, y + 46, 10, GOLD, { lw: 1.6, sx: 0.9, track: 1.5 });
  resetClip();
}

function ipoArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h, '#0e1726', '#16243a');
  for (let i = 1; i < 5; i++) line(x, y + i * h / 5, x + w, y + i * h / 5, 1, '#ffffff', 0.08);
  // price path: $83 IPO -> $111.50 open -> $97.17 close
  const lo = 75, hi = 118;
  const py = (p) => y + h - 12 - (p - lo) / (hi - lo) * (h - 34);
  const L = x + 22, R = x + w - 22;
  const path = [[L, py(83)], [L + (R - L) * 0.18, py(83)], [L + (R - L) * 0.24, py(111.5)], [L + (R - L) * 0.33, py(104)], [L + (R - L) * 0.42, py(108)], [L + (R - L) * 0.55, py(99)], [L + (R - L) * 0.66, py(102)], [L + (R - L) * 0.8, py(95)], [L + (R - L) * 0.9, py(98.5)], [R, py(97.17)]];
  fillPoly([[...path, [R, y + h], [L, y + h]]], '#2ecc71', 0.16);
  strokeLines([path], 3, '#37d67a');
  line(L, py(83), R, py(83), 1, '#ffffff', 0.35);
  drawText('IPO $83', L, py(83) + 6, 9, '#c9d2de', { lw: 1.4, sx: 0.88 });
  fillCircle(path[2][0], path[2][1], 4, '#ffffff');
  drawText('OPEN $111.50', path[2][0] + 8, path[2][1] - 4, 9, '#ffffff', { lw: 1.4, sx: 0.88 });
  fillCircle(R, py(97.17), 4, '#ffffff');
  drawText('CLOSE $97.17', R - 4, py(97.17) + 10, 9, '#ffffff', { lw: 1.4, sx: 0.88, align: 'right' });
  fillPoly([roundRect(x + w - 128, y + 10, 116, 34, 5)], '#37d67a');
  drawText('ANT +17%', x + w - 70, y + 19, 17, '#0e1726', { lw: 3, sx: 0.84, align: 'center' });
  drawText('NASDAQ', x + 14, y + 14, 11, '#9fb0c6', { lw: 1.7, sx: 0.9, track: 1.5 });
  resetClip();
}

function ukraineArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h, '#0b1733', '#2a4a86');
  // snow
  const flakes = [[20, 18], [64, 40], [110, 14], [150, 52], [196, 22], [240, 44], [286, 16], [300, 60], [40, 70], [128, 84], [210, 74], [260, 92]];
  for (const [fx, fy] of flakes) fillCircle(x + fx, y + fy, 1.8, '#ffffff', 0.85);
  // power pylon (energy) on the left
  const p = x + 58, b = y + h - 14;
  strokeLines([[[p - 24, b], [p - 6, y + 22], [p + 6, y + 22], [p + 24, b]], [[p - 22, b - 8], [p + 14, y + 50]], [[p + 22, b - 8], [p - 14, y + 50]], [[p - 30, y + 36], [p + 30, y + 36]], [[p - 24, y + 56], [p + 24, y + 56]]], 2.2, '#c9d4e8');
  strokeLines([[[x - 4, y + 44], [p - 30, y + 38]], [[p + 30, y + 38], [x + w * 0.5, y + 48]]], 1.2, '#c9d4e8', 0.8);
  // golden-domed cathedral
  const cx = x + w * 0.66, base = y + h - 14;
  fillRect(cx - 62, base - 50, 124, 50, '#e9e2d0');
  fillRect(cx - 22, base - 80, 44, 32, '#e9e2d0');
  for (const [dx, r, top] of [[-44, 13, 50], [44, 13, 50], [0, 19, 80]]) {
    const bx = cx + dx, by = base - top;
    fillPoly([[[bx - r, by], ...ellipse(bx, by - r * 0.2, r, r * 1.1, Math.PI, Math.PI * 1.5, 10), [bx, by - r * 2.1], ...ellipse(bx, by - r * 0.2, r, r * 1.1, Math.PI * 1.5, Math.PI * 2, 10), [bx + r, by]]], GOLD);
    line(bx, by - r * 2.1, bx, by - r * 2.1 - 10, 1.6, GOLD);
    line(bx - 4, by - r * 2.1 - 6, bx + 4, by - r * 2.1 - 6, 1.4, GOLD);
  }
  for (const dx of [-40, -20, 20, 40]) fillPoly([roundRect(cx + dx - 4, base - 38, 8, 18, 4)], '#5c6e8f');
  fillPoly([roundRect(cx - 8, base - 30, 16, 30, 7)], '#5c6e8f');
  // smoke over the cathedral, and an attack drone (delta wing, seen from below)
  fillCircle(cx + 56, y + 40, 9, '#7a7d88', 0.55);
  fillCircle(cx + 70, y + 30, 12, '#7a7d88', 0.45);
  fillCircle(cx + 88, y + 26, 14, '#7a7d88', 0.35);
  fillCircle(cx + 50, y + 46, 5, '#ff8a3a', 0.9);
  const dxp = x + w * 0.38, dyp = y + 30;
  fillPoly([[[dxp + 26, dyp - 4], [dxp - 20, dyp - 20], [dxp - 12, dyp - 4], [dxp - 20, dyp + 12]]], '#0c0d12');
  fillPoly([[[dxp - 14, dyp - 5], [dxp - 26, dyp - 7], [dxp - 26, dyp - 1], [dxp - 14, dyp - 3]]], '#0c0d12');
  fillRect(x, y + h - 14, w, 14, '#eef3fb');
  flagUA(x + w - 46, y + 10, 34, 22);
  resetClip();
}

function riyadhArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h, '#0f1836', '#5a3d62');
  const g = y + h - 12;
  // skyline of the King Abdullah Financial District
  const towers = [[8, 40, 28], [40, 58, 24], [68, 34, 30], [102, 50, 26], [200, 62, 28], [232, 42, 30], [266, 70, 24], [294, 46, 28]];
  for (const [ox, th, tw] of towers) {
    fillRect(x + ox, g - th, tw, th + 2, '#2c2f58');
    for (let k = 8; k < th - 4; k += 9) fillRect(x + ox + 5, g - k, tw - 10, 2, '#f3d27a', 0.18);
  }
  // PIF tower: Riyadh's tallest, light glass with a sloped crown
  const cx = x + w * 0.47, top = y + 6;
  fillPoly([[[cx - 24, g], [cx - 21, top + 22], [cx - 8, top], [cx + 21, top + 14], [cx + 24, g]]], '#9fb2d6');
  fillPoly([[[cx, g], [cx, top + 4], [cx + 21, top + 14], [cx + 24, g]]], '#7f93bd');
  for (let yy = top + 22; yy < g - 4; yy += 7) line(cx - 20, yy, cx + 20, yy, 1, '#46557e', 0.45);
  // damage, fire and smoke on upper floors
  fillPoly([[[cx - 14, top + 30], [cx + 6, top + 26], [cx + 12, top + 38], [cx - 6, top + 44], [cx - 16, top + 40]]], '#2b2230');
  fillCircle(cx - 2, top + 36, 7, '#ff7a1a', 0.95);
  fillCircle(cx, top + 35, 3.5, '#ffd25a');
  for (const [dx, dy, r, a] of [[10, 26, 10, 0.7], [24, 18, 13, 0.6], [42, 12, 16, 0.5], [64, 8, 19, 0.4], [90, 6, 21, 0.3]]) fillCircle(cx + dx, top + dy, r, '#9a9aa6', a);
  // incoming projectile trail from the south-west
  line(x + 4, y + h * 0.42, cx - 26, top + 36, 2, '#ffd9a0', 0.55);
  fillRect(x, g, w, 12, '#0b0c18');
  flagSA(x + w - 46, y + 10, 34, 22);
  resetClip();
}

function copArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h, '#cfe7ea', '#9fcfd6');
  // globe
  const gx = x + w * 0.8, gy = y + h * 0.58, r = 40;
  fillCircle(gx, gy, r, '#2d7fc1');
  setClip(Math.max(x, gx - r), gy - r, 2 * r, 2 * r);
  fillPoly([[[gx - 30, gy - 30], [gx - 4, gy - 36], [gx + 6, gy - 18], [gx - 8, gy - 4], [gx - 2, gy + 14], [gx - 18, gy + 30], [gx - 30, gy + 6], [gx - 40, gy - 8]]], '#4caf50');
  fillPoly([[[gx + 12, gy - 6], [gx + 34, gy - 20], [gx + 42, gy + 6], [gx + 26, gy + 30], [gx + 14, gy + 16]]], '#4caf50');
  setClip(x, y, w, h);
  // draft text document
  const dx = x + 18, dy = y + 10, dw = w * 0.64, dh = h - 2;
  fillRect(dx + 4, dy + 4, dw, dh, '#000000', 0.15);
  fillRect(dx, dy, dw, dh, '#ffffff');
  drawText('COP31 DRAFT DEAL', dx + 10, dy + 9, 10, INK, { lw: 1.7, sx: 0.88 });
  for (let i = 0; i < 2; i++) line(dx + 10, dy + 30 + i * 9, dx + dw - 12 - (i % 2) * 30, dy + 30 + i * 9, 3, '#c7ccd4');
  // the deleted words, highlighted and struck through
  fillRect(dx + 6, dy + 46, dw - 12, 34, '#ffe9a8');
  drawText('TRANSITION AWAY FROM', dx + 11, dy + 50, 9, INK, { lw: 1.5, sx: 0.84 });
  drawText('FOSSIL FUELS', dx + 11, dy + 65, 11, INK, { lw: 2, sx: 0.84 });
  line(dx + 8, dy + 54.5, dx + 11 + measure('TRANSITION AWAY FROM', 9, { lw: 1.5, sx: 0.84 }) + 3, dy + 54.5, 2.2, RED);
  line(dx + 8, dy + 70.5, dx + 11 + measure('FOSSIL FUELS', 11, { lw: 2, sx: 0.84 }) + 3, dy + 70.5, 2.6, RED);
  for (let i = 0; i < 3; i++) line(dx + 10, dy + 90 + i * 9, dx + dw - 14 - ((i + 1) % 2) * 26, dy + 90 + i * 9, 3, '#c7ccd4');
  resetClip();
}

function hippoArt(x, y, w, h) {
  setClip(x, y, w, h);
  vgrad(x, y, w, h * 0.5, '#bfe3f2', '#e6f3e2');
  fillPoly([[[x, y + h * 0.42], [x + w * 0.3, y + h * 0.34], [x + w * 0.6, y + h * 0.4], [x + w, y + h * 0.33], [x + w, y + h * 0.6], [x, y + h * 0.6]]], '#4f8a3a');
  vgrad(x, y + h * 0.55, w, h * 0.45, '#5a8fa8', '#3b6f86');
  // hippo, half submerged
  const hx = x + w * 0.5, hy = y + h * 0.68;
  setClip(x, y, w, h * 0.72);
  fillEllipse(hx - 30, hy + 2, 58, 30, '#7b6f80');
  fillEllipse(hx + 34, hy - 6, 34, 24, '#857888');
  fillEllipse(hx + 52, hy + 2, 24, 18, '#8d8090');
  fillEllipse(hx + 18, hy - 30, 6, 8, '#6d6272');
  fillEllipse(hx + 40, hy - 30, 6, 8, '#6d6272');
  fillCircle(hx + 28, hy - 16, 4, '#ffffff');
  fillCircle(hx + 29, hy - 16, 2.2, '#111');
  fillEllipse(hx + 58, hy - 6, 3, 2, '#3d3440');
  fillEllipse(hx + 68, hy - 4, 3, 2, '#3d3440');
  setClip(x, y, w, h);
  for (let i = 0; i < 4; i++) line(hx - 80 + i * 40, y + h * 0.74 + (i % 2) * 6, hx - 56 + i * 40, y + h * 0.74 + (i % 2) * 6, 2, '#ffffff', 0.5);
  flagCO(x + 12, y + 10, 34, 22);
  resetClip();
}

// ---------------------------------------------------------------- stories (all dated Thursday 19 November 2026)

const LEAD = {
  kicker: 'SHENZHEN, CHINA · APEC SUMMIT',
  head: 'TRUMP, XI AND PUTIN HOLD FIRST-EVER THREE-WAY SUMMIT',
  body: 'US, Chinese and Russian leaders meet on the APEC sidelines; Xi warns a nuclear war "cannot be won and must never be fought". Ukraine, Iran and trade on the table.',
};

const STORIES = [
  { art: icjArt, kicker: 'THE HAGUE', head: 'WORLD COURT: MYANMAR COMMITTED GENOCIDE', body: 'ICJ rules 9-6 on the Rohingya in a case brought by The Gambia; first time it finds a state guilty of genocide.' },
  { art: ipoArt, kicker: 'NEW YORK', head: 'ANTHROPIC JUMPS 17% IN NASDAQ DEBUT', body: 'Biggest IPO ever raised $81.3BN at $83 a share; stock opens at $111.50, closes at $97.17.' },
  { art: ukraineArt, kicker: 'BERLIN · KYIV', head: 'ALLIES URGE RUSSIA: WINTER ENERGY TRUCE', body: 'Berlin summit with Zelensky and US envoys; Putin rules out truce after Crimean Bridge strike. Drones hit Kyiv cathedral.' },
  { art: riyadhArt, kicker: 'RIYADH', head: "HOUTHI ATTACK DAMAGES RIYADH'S TALLEST TOWER", body: 'Saudi wealth fund PIF tower hit, no injuries reported; Houthi media report Saudi air raids on Sanaa.' },
  { art: copArt, kicker: 'ANTALYA · COP31', head: 'CLIMATE DRAFT DROPS FOSSIL FUEL LANGUAGE', body: 'New text at the UN talks in Turkey strips calls to move away from coal, oil and gas.' },
  { art: hippoArt, kicker: 'COLOMBIA', head: "COLOMBIA TO PUT DOWN 10 OF ESCOBAR'S HIPPOS", body: "Four-month pilot cull of the invasive herd descended from the drug lord's private zoo." },
];

const TICKER = [
  'IAEA: US, UK, FRANCE AND GERMANY PRESS IRAN TO LET INSPECTORS BACK INTO BOMBED NUCLEAR SITES',
  "CHINA CURBS EXPORTS OF DRONE ENGINES USED IN RUSSIA'S GERAN ATTACK DRONES",
  "TRUMP ASKS SUPREME COURT, FOR A THIRD TIME, TO END VENEZUELANS' TPS PROTECTIONS",
];

// ---------------------------------------------------------------- page layout

function render() {
  fillRect(0, 0, W, H, PAPER);

  // masthead
  fillRect(0, 0, W, 112, NAVY);
  drawText('THE WORLD IN ONE PICTURE', 24, 15, 12, GOLD, KICK(12));
  drawText("THE DAY'S WORLD NEWS", W - 24, 15, 12, '#9fb0c6', Object.assign(KICK(12), { align: 'right' }));
  const date = 'THURSDAY 19 NOVEMBER 2026';
  let ds = 46;
  const dO = { lw: 6.4, sx: 0.86 };
  while (measure(date, ds, dO) > W - 48) { ds -= 1; dO.lw = ds * 0.14; }
  drawText(date, W / 2, 38, ds, '#ffffff', Object.assign(dO, { align: 'center' }));
  fillRect(0, 112, W, 5, RED);

  const M = 14;
  // lead story
  const ly = 125, lh = 250;
  card(M, ly, W - 2 * M, lh);
  leadArt(M, ly, 500, lh);
  const tx = M + 516, tw = W - M - 14 - tx;
  drawText(LEAD.kicker, tx, ly + 18, 12, RED, KICK(12));
  const lead = chooseSizes([LEAD], tw, ly + lh - 12 - (ly + 42), [30, 28, 26, 24], [13.5, 13, 12.5, 12]);
  drawBlock(LEAD.head, LEAD.body, tx, ly + 42, tw, lead.hs, lead.bs);

  // six-story grid: one headline size and one body size for every card, the largest that fits them all
  const gap = 10, gy = ly + lh + gap;
  const cw = (W - 2 * M - 2 * gap) / 3, ch = 280, artH = 118, textTop = 148;
  const fit = chooseSizes(STORIES, cw - 22, ch - 8 - textTop, [20, 19, 18, 17, 16], [11.5, 11, 10.5, 10]);
  console.log('card type: headline ' + fit.hs + 'px, body ' + fit.bs + 'px; lead: headline ' + lead.hs + 'px, body ' + lead.bs + 'px');
  STORIES.forEach((s, i) => {
    const cx = M + (i % 3) * (cw + gap), cy = gy + Math.floor(i / 3) * (ch + gap);
    card(cx, cy, cw, ch);
    s.art(cx, cy, cw, artH);
    drawText(s.kicker, cx + 12, cy + 129, 10.5, RED, KICK(10.5));
    drawBlock(s.head, s.body, cx + 12, cy + textTop, cw - 22, fit.hs, fit.bs);
  });

  // ticker of further stories
  const ty = gy + 2 * ch + gap + 7;
  fillRect(0, ty, W, H - ty, NAVY);
  fillRect(M, ty + 9, 96, H - ty - 18, RED);
  drawText('ALSO ON', M + 48, ty + 17, 11, '#ffffff', Object.assign(KICK(11), { align: 'center' }));
  drawText('19 NOV', M + 48, ty + 34, 11, '#ffffff', Object.assign(KICK(11), { align: 'center' }));
  let ts = 10.5;
  while (TICKER.some(t => measure(t, ts, BODY(ts)) > W - M - 128 - 12)) ts -= 0.25;
  TICKER.forEach((t, i) => {
    fillCircle(M + 118, ty + 15 + i * 16.5, 2.6, GOLD);
    drawText(t, M + 128, ty + 10 + i * 16.5, ts, '#ffffff', BODY(ts));
  });
}

function card(x, y, w, h) {
  fillPoly([roundRect(x + 2, y + 3, w, h, 3)], '#000000', 0.07);
  fillRect(x, y, w, h, CARD);
}

// Height of a headline + rule + body block at the given sizes.
function blockHeight(head, body, w, hs, bs) {
  const hl = wrap(head, hs, HEAD(hs), w).length;
  const bl = wrap(body, bs, BODY(bs), w).length;
  return hl * hs * 1.3 + 11 + bl * bs * 1.45 - bs * 0.45;
}
// The largest headline size (then the largest body size) at which every story's block fits in `avail` pixels.
// Headlines win: they are what a reader sees first and what must survive being shown small.
function chooseSizes(stories, w, avail, headSizes, bodySizes) {
  for (const hs of headSizes) {
    for (const bs of bodySizes) {
      if (stories.every(s => blockHeight(s.head, s.body, w, hs, bs) <= avail)) return { hs, bs };
    }
  }
  throw new Error('copy does not fit at any size');
}
function drawBlock(head, body, x, y, w, hs, bs) {
  const end = drawPara(head, x, y, hs, INK, HEAD(hs), w, hs * 1.3);
  fillRect(x, end + 1, 40, 2.5, RED);
  drawPara(body, x, end + 11, bs, MUTED, BODY(bs), w, bs * 1.45);
}

// ---------------------------------------------------------------- PNG encoder

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG() {
  const stride = W * 3;
  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < img.length; i++) { const v = Math.round(px[i]); img[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
  const raw = Buffer.alloc((stride + 1) * H);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < H; y++) {
    const row = y * stride, prev = (y - 1) * stride;
    let bestF = 0, bestS = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? img[row + i - 3] : 0;
        const b = y > 0 ? img[prev + i] : 0;
        const c = y > 0 && i >= 3 ? img[prev + i - 3] : 0;
        const x = img[row + i];
        let v;
        if (f === 0) v = x;
        else if (f === 1) v = x - a;
        else if (f === 2) v = x - b;
        else if (f === 3) v = x - ((a + b) >> 1);
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        v &= 255;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestS) { bestS = sum; bestF = f; }
    }
    raw[y * (stride + 1)] = bestF;
    raw.set(cand[bestF], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main

render();
const png = encodePNG();
if (png.length > 1048576) throw new Error('PNG over 1 MiB: ' + png.length);
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log('wrote ' + join(outDir, 'entry.png') + ' (' + png.length + ' bytes)');
