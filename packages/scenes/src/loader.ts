import { pathToFileURL } from 'url'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

export async function importFile(filepath: string): Promise<any> {
  if (filepath.endsWith('.ts')) {
    return jiti.import(filepath)
  }
  return import(pathToFileURL(filepath).href)
}
