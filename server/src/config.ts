import path from 'node:path';
import fs from 'node:fs';

/** Resolved filesystem locations. Override the data folder with WORLDKEEPER_DATA_DIR. */
export interface Paths {
  dataDir: string;
  dbFile: string;
  backupsDir: string;
  uploadsDir: string;
  stagingDir: string;
}

export function resolvePaths(dataDir = process.env.WORLDKEEPER_DATA_DIR || path.resolve(process.cwd(), 'data')): Paths {
  const p: Paths = {
    dataDir,
    dbFile: path.join(dataDir, 'worldkeeper.db'),
    backupsDir: path.join(dataDir, 'backups'),
    uploadsDir: path.join(dataDir, 'uploads'),
    stagingDir: path.join(dataDir, 'staging'),
  };
  for (const d of [p.dataDir, p.backupsDir, p.uploadsDir, p.stagingDir]) fs.mkdirSync(d, { recursive: true });
  return p;
}
