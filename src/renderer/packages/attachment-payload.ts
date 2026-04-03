/**
 * Attachment payload formatting utilities.
 *
 * Extracted from context-management/attachment-payload.ts during security
 * hardening (direct model-call packages removed). Contains only the pure
 * formatting helpers needed by token-estimation and token.tsx — no LLM or
 * search API calls.
 */

export const MAX_INLINE_FILE_LINES = 500
export const PREVIEW_LINES = 100

export interface AttachmentWrapperPrefixParams {
  attachmentIndex: number
  fileName: string
  fileKey: string
  fileLines: number
  fileSize: number
}

export interface AttachmentWrapperSuffixParams {
  isTruncated: boolean
  previewLines?: number
  totalLines?: number
  fileKey?: string
}

export function buildAttachmentWrapperPrefix(params: AttachmentWrapperPrefixParams): string {
  const { attachmentIndex, fileName, fileKey, fileLines, fileSize } = params

  let prefix = '\n\n<ATTACHMENT_FILE>\n'
  prefix += `<FILE_INDEX>${attachmentIndex}</FILE_INDEX>\n`
  prefix += `<FILE_NAME>${fileName}</FILE_NAME>\n`
  prefix += `<FILE_KEY>${fileKey}</FILE_KEY>\n`
  prefix += `<FILE_LINES>${fileLines}</FILE_LINES>\n`
  prefix += `<FILE_SIZE>${fileSize} bytes</FILE_SIZE>\n`
  prefix += '<FILE_CONTENT>\n'

  return prefix
}

export function buildAttachmentWrapperSuffix(params: AttachmentWrapperSuffixParams): string {
  const { isTruncated, previewLines, totalLines, fileKey } = params

  let suffix = '</FILE_CONTENT>\n'

  if (isTruncated && previewLines !== undefined && totalLines !== undefined && fileKey !== undefined) {
    suffix += `<TRUNCATED>Content truncated. Showing first ${previewLines} of ${totalLines} lines. Use read_file or search_file_content tool with FILE_KEY="${fileKey}" to read more content.</TRUNCATED>\n`
  }

  suffix += '</ATTACHMENT_FILE>\n'

  return suffix
}
