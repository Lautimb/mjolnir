export function createZip(files: [name: string, content: Buffer][]): Buffer

export function packPlugin(dir: string, out?: string): Promise<{ file: string; id: string; version: string; files: number }>
