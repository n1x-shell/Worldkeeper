/**
 * A small QR code encoder for the handbook addresses (docs/LIBRARIES_PLAN.md §2.3): byte mode, error correction level
 * M, versions 1 to 10 (up to 213 bytes, far more than an address needs). It follows ISO/IEC 18004: Reed–Solomon error
 * correction over GF(256), block interleaving, the function patterns, the eight masks (the one with the lowest penalty
 * is used) and the format and version bits. Returns the modules as rows of booleans (true is dark), with no quiet zone.
 */

// Level M, by version (index 0 unused): error correction codewords per block, and the number of blocks.
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
// The format bits' two error correction level bits for M.
const LEVEL_M_BITS = 0;

/** Modules available for data and error correction in a version (everything but the function patterns). */
function rawDataModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

/** The centres of the alignment patterns along each axis. */
export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---------------------------------------------------------------- Reed–Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

/** The error correction codewords for a block of data codewords. */
export function rsRemainder(data: number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const out = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    divisor.forEach((coef, i) => (out[i] ^= gfMul(coef, factor)));
  }
  return out;
}

// ---------------------------------------------------------------- format and version bits

/** The 15 format bits for level M and a mask, BCH-coded and masked with 0x5412. */
export function formatBits(mask: number): number {
  const data = (LEVEL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits (versions 7 and up). */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// ---------------------------------------------------------------- the symbol

class QrSymbol {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];

  constructor(readonly ver: number) {
    this.size = ver * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.functionPatterns();
  }

  private set(x: number, y: number, on: boolean) {
    this.dark[y][x] = on;
    this.fixed[y][x] = true;
  }

  private functionPatterns() {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [n - 4, 3],
      [3, n - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < n && y >= 0 && y < n) this.set(x, y, d !== 2 && d !== 4);
        }
    }
    const pos = alignmentPositions(this.ver);
    const last = pos.length - 1;
    pos.forEach((ay, i) =>
      pos.forEach((ax, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.format(0); // reserved now, drawn for real once the mask is chosen
    if (this.ver >= 7) {
      const bits = versionBits(this.ver);
      for (let i = 0; i < 18; i++) {
        const a = n - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, bit(bits, i));
        this.set(b, a, bit(bits, i));
      }
    }
  }

  format(mask: number) {
    const bits = formatBits(mask);
    const n = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.set(n - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, n - 15 + i, bit(bits, i));
    this.set(8, n - 8, true); // the dark module
  }

  /** Place the codewords in the two-column zigzag, from the bottom right. */
  codewords(data: number[]) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < n; v++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? n - 1 - v : v;
          if (!this.fixed[y][x] && i < data.length * 8) {
            this.dark[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
    }
  }

  mask(m: number) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (!this.fixed[y][x] && MASKS[m](x, y)) this.dark[y][x] = !this.dark[y][x];
  }

  /** The standard's penalty: runs of five or more, 2×2 blocks, finder-like patterns, and dark/light balance. */
  penalty(): number {
    const n = this.size;
    let score = 0;
    const lines: boolean[][] = [];
    for (let y = 0; y < n; y++) lines.push(this.dark[y]);
    for (let x = 0; x < n; x++) lines.push(this.dark.map((row) => row[x]));
    const finderLike = [true, false, true, true, true, false, true];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      for (let i = 0; i + 7 <= n; i++) {
        if (!finderLike.every((v, k) => line[i + k] === v)) continue;
        const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
        const lightAfter = i + 11 <= n && [7, 8, 9, 10].every((k) => !line[i + k]);
        if (lightBefore || lightAfter) score += 40;
      }
    }
    for (let y = 0; y + 1 < n; y++)
      for (let x = 0; x + 1 < n; x++) {
        const c = this.dark[y][x];
        if (c === this.dark[y][x + 1] && c === this.dark[y + 1][x] && c === this.dark[y + 1][x + 1]) score += 3;
      }
    const darkCount = this.dark.reduce((s, row) => s + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs(darkCount * 20 - n * n * 10) / (n * n)) * 10;
    return score;
  }
}

/** The data codewords for some bytes in a version: mode, count, the bytes, terminator and padding. */
function dataFor(bytes: Uint8Array, ver: number): number[] {
  const bits: number[] = [];
  const put = (v: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** Split into blocks, add each block's error correction, and interleave. */
function withErrorCorrection(data: number[], ver: number): number[] {
  const blocks = BLOCKS[ver];
  const ecc = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - ecc + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const rem = rsRemainder(dat, ecc);
    if (i < shortBlocks) dat.push(0);
    all.push([...dat, ...rem]);
  }
  const out: number[] = [];
  for (let i = 0; i < all[0].length; i++) all.forEach((b, j) => (i !== shortLen - ecc || j >= shortBlocks) && out.push(b[i]));
  return out;
}

/** Encode text (UTF-8) as a QR code: rows of modules, true for dark. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= MAX_VERSION && 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > MAX_VERSION) throw new Error('Too long for a QR code here');
  const codewords = withErrorCorrection(dataFor(bytes, ver), ver);
  let best: QrSymbol | null = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const s = new QrSymbol(ver);
    s.codewords(codewords);
    s.mask(m);
    s.format(m);
    const score = s.penalty();
    if (score < bestScore) [best, bestScore] = [s, score];
  }
  return best!.dark;
}

/** The QR code as an SVG path ("M x y h1 v1 h-1 z" per dark module), with a quiet zone of `border` modules. */
export function qrSvgPath(matrix: boolean[][], border = 4): { path: string; size: number } {
  let path = '';
  matrix.forEach((row, y) => row.forEach((on, x) => on && (path += `M${x + border} ${y + border}h1v1h-1z`)));
  return { path, size: matrix.length + border * 2 };
}
