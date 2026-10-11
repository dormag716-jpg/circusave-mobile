import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

export type PdfShareCopy = {
  dialogTitle: string;
  savedTitle: string;
  savedBody: string;
};

/** Write the PDF to the app cache and open the normal system share sheet. */
export async function saveAndSharePdf(
  bytes: Uint8Array,
  filename: string,
  copy: PdfShareCopy,
): Promise<{ uri: string; filename: string }> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(bytes);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: copy.dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert(copy.savedTitle, copy.savedBody);
  }
  return { uri: file.uri, filename };
}
