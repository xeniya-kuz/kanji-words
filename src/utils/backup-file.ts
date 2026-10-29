import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { backupFileName, parseBackup, type Backup } from '@/core/backup';

/** Writes the backup to a file and opens the share sheet (Google Drive, email, messengers, …). */
export async function shareBackup(backup: Backup): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = new File(Paths.cache, backupFileName());
  file.create({ overwrite: true });
  await file.write(JSON.stringify(backup));
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Kanji Words backup' });
  } finally {
    file.delete();
  }
}

/** Lets the user pick a backup file; resolves to null if they cancel. */
export async function pickBackup(): Promise<Backup | null> {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return null;
  return parseBackup(await picked.result.text());
}
