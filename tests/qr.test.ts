/** The QR encoder for handbook addresses (shared/qr.ts), against the standard's published values and a reader. */
import { describe, expect, it } from 'vitest';
import { alignmentPositions, formatBits, qrMatrix, rsRemainder, versionBits } from '../shared/qr.js';

// GF(256) for the reader: exp/log tables, independent of the encoder's multiplication.
const EXP: number[] = [];
const LOG: number[] = [];
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
const mul = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

/** A codeword block is valid when it vanishes at α^0 … α^(ecc-1). */
function syndromesZero(block: number[], ecc: number) {
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const c of block) s = mul(s, EXP[i]) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/** Read a matrix back: format bits (both copies), unmask, codewords, blocks, error correction, then the bytes. */
function read(m: boolean[][]): string {
  const n = m.length;
  const ver = (n - 17) / 4;
  const at = (x: number, y: number) => (m[y][x] ? 1 : 0);
  // Format bits, first copy (around the top-left finder) and second (split between the other two).
  let f1 = 0;
  const first: [number, number][] = [];
  for (let i = 0; i <= 5; i++) first.push([8, i]);
  first.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) first.push([14 - i, 8]);
  first.forEach(([x, y], i) => (f1 |= at(x, y) << i));
  let f2 = 0;
  for (let i = 0; i < 8; i++) f2 |= at(n - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= at(8, n - 15 + i) << i;
  expect(f1).toBe(f2);
  const mask = [...Array(8).keys()].find((k) => formatBits(k) === f1);
  expect(mask).toBeDefined();
  expect(at(8, n - 8)).toBe(1);
  // Which modules are function patterns.
  const fn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const mark = (x0: number, y0: number, w: number, h: number) => {
    for (let y = Math.max(0, y0); y < Math.min(n, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(n, x0 + w); x++) fn[y][x] = true;
  };
  mark(0, 0, 9, 9);
  mark(n - 8, 0, 8, 9);
  mark(0, n - 8, 9, 8);
  mark(6, 0, 1, n);
  mark(0, 6, n, 1);
  const pos = alignmentPositions(ver);
  pos.forEach((ay, i) => pos.forEach((ax, j) => !((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) && mark(ax - 2, ay - 2, 5, 5)));
  if (ver >= 7) {
    mark(n - 11, 0, 3, 6);
    mark(0, n - 11, 6, 3);
  }
  const masks = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const bits: number[] = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let v = 0; v < n; v++) {
      const y = up ? n - 1 - v : v;
      for (const x of [right, right - 1]) if (!fn[y][x]) bits.push(at(x, y) ^ (masks[mask!](x, y) ? 1 : 0));
    }
  }
  const total = Math.floor(bits.length / 8);
  const words = Array.from({ length: total }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  // De-interleave: short blocks first, each one data word shorter.
  const nb = BLOCKS[ver];
  const ecc = ECC[ver];
  const longCount = total % nb;
  const shortData = Math.floor(total / nb) - ecc;
  const dataLens = Array.from({ length: nb }, (_, i) => shortData + (i >= nb - longCount ? 1 : 0));
  const blocks = dataLens.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < shortData + 1; i++) blocks.forEach((b, j) => i < dataLens[j] && b.push(words[k++]));
  for (let i = 0; i < ecc; i++) blocks.forEach((b) => b.push(words[k++]));
  for (const b of blocks) expect(syndromesZero(b, ecc)).toBe(true);
  const data = blocks.flatMap((b, j) => b.slice(0, dataLens[j]));
  const dbits = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >>> i) & 1));
  const take = (len: number) => dbits.splice(0, len).reduce((a, b) => (a << 1) | b, 0);
  expect(take(4)).toBe(0b0100);
  const count = take(ver <= 9 ? 8 : 16);
  return new TextDecoder().decode(new Uint8Array(Array.from({ length: count }, () => take(8))));
}

describe('QR codes for handbook addresses', () => {
  it('matches the standard’s worked example and published bit values', () => {
    // "01234567" at version 1-M: its 16 data codewords and their 10 error correction codewords.
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
    // Format bits for level M: mask 0 is 101010000010010; version 7's bits are 000111110010010100.
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect(formatBits(5).toString(2).padStart(15, '0')).toBe('100000011001110');
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  it('reads back exactly, at every size an address can need', () => {
    for (const text of ['http://192.168.1.20:4320/player/c/K7QX2M9P', 'https://a.example/', 'x'.repeat(100), `http://10.0.0.5:4320/player/c/${'AB'.repeat(60)}`, 'Ünïcode → ok']) {
      const m = qrMatrix(text);
      expect(m.length % 4).toBe(1);
      expect(read(m)).toBe(text);
    }
    expect(qrMatrix('http://192.168.1.20:4320/player/c/K7QX2M9P').length).toBe(29); // version 3
    expect(qrMatrix('y'.repeat(200)).length).toBe(57); // version 10, the longest
    expect(read(qrMatrix('y'.repeat(200)))).toBe('y'.repeat(200));
    expect(() => qrMatrix('x'.repeat(300))).toThrow();
  });
});
