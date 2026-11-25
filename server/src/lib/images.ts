/** What a picture file really is, whatever it is called. */

/** Check the file's magic bytes, not only its declared type. SVG is refused (it can carry script). */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return '.gif';
  return null;
}
