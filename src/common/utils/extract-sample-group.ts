export function extractSampleGroup(nome: string): string {
  return nome
    .replace(/^#/, '')
    .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}.*$/, '')
    .trim();
}