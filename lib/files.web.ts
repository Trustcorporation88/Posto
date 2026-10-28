export function pickCSV(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 5 * 1024 * 1024)
        return reject(new Error("Escolha um CSV de até 5 MB."));
      try {
        resolve(await file.text());
      } catch {
        reject(new Error("Não foi possível ler o arquivo."));
      }
    };
    input.click();
  });
}
export async function saveCSV(
  content: string,
  filename: string,
): Promise<void> {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
