export const DEFAULT_IMAGE_DEPLOYMENT = 'gpt-image-1-mini'
export const DEFAULT_IMAGE_API_VERSION = '2025-04-01-preview'

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'
export type ImageQuality = 'low' | 'medium' | 'high'

export interface ImageGenerationOptions {
  size?: unknown
  quality?: unknown
  n?: unknown
  style?: unknown
}

const IMAGE_SIZES: ImageSize[] = ['1024x1024', '1024x1536', '1536x1024']
const IMAGE_QUALITIES: ImageQuality[] = ['low', 'medium', 'high']

export function buildImageGenerationPayload(
  prompt: string,
  options: ImageGenerationOptions,
): Record<string, unknown> {
  if (options.size !== undefined && !IMAGE_SIZES.includes(options.size as ImageSize)) {
    throw new Error(`Unsupported image size: ${String(options.size)}`)
  }
  if (options.quality !== undefined && !IMAGE_QUALITIES.includes(options.quality as ImageQuality)) {
    throw new Error(`Unsupported image quality: ${String(options.quality)}`)
  }
  if (options.style !== undefined) {
    throw new Error('Image style is not supported by GPT-Image-1-mini')
  }
  if (options.quality !== undefined && options.quality !== 'low') {
    throw new Error('Only low-quality images are enabled by the server cost policy')
  }
  if (options.n !== undefined && (typeof options.n !== 'number' || !Number.isInteger(options.n))) {
    throw new Error('Image count must be an integer')
  }
  if (options.n !== undefined && options.n !== 1) {
    throw new Error('Only one image per request is enabled by the server cost policy')
  }

  return {
    prompt,
    size: (options.size as ImageSize | undefined) || '1024x1024',
    quality: 'low',
    output_format: 'png',
    n: 1,
  }
}