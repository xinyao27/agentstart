export type PdfExportInput = { html: string; title: string }

export type PdfExportResult =
  | { success: true; filePath: string }
  | { success: false; cancelled?: boolean; error?: string }
