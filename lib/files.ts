import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
export async function pickCSV(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "text/plain",
      "application/csv",
      "application/vnd.ms-excel",
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > 5 * 1024 * 1024)
    throw new Error("Escolha um CSV de até 5 MB.");
  return new File(asset.uri).text();
}
export async function saveCSV(
  content: string,
  filename: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "O compartilhamento de arquivos não está disponível neste dispositivo.",
    );
  const file = new File(Paths.cache, filename);
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values",
  });
}
