import { mkdirSync } from 'node:fs';
import { DEFAULT_MODEL, EmbeddingError, MODELS_DIR } from '@ccto/shared';

// Lazy-loaded pipeline — downloaded on first call
let pipelineInstance:
  | ((
      inputs: string | string[],
      options?: { pooling?: string; normalize?: boolean },
    ) => Promise<{ data: Float32Array }>)
  | null = null;

/**
 * Load the embedding pipeline (downloads model on first call if needed).
 */
async function getPipeline(modelName = DEFAULT_MODEL) {
  if (pipelineInstance) return pipelineInstance;

  // Ensure model cache directory exists
  mkdirSync(MODELS_DIR, { recursive: true });

  try {
    // @huggingface/transformers resolves the model via the TRANSFORMERS_CACHE env var
    process.env.TRANSFORMERS_CACHE = MODELS_DIR;

    const { pipeline } = await import('@huggingface/transformers');
    // @ts-expect-error — pipeline typing is complex; works at runtime
    pipelineInstance = await pipeline('feature-extraction', modelName, {
      dtype: 'fp32',
    });
    // pipelineInstance is guaranteed non-null here — just assigned above
    return pipelineInstance as NonNullable<typeof pipelineInstance>;
  } catch (err) {
    throw new EmbeddingError(`Failed to load embedding model "${modelName}"`, { cause: err });
  }
}

/**
 * Compute embeddings for a batch of texts.
 * Downloads the model on first call (~23 MB, cached afterwards).
 *
 * @param texts - Array of text strings to embed
 * @param modelName - HuggingFace model ID (default: Xenova/all-MiniLM-L6-v2)
 * @returns Array of Float32Array embedding vectors (384 dimensions)
 */
export async function embed(texts: string[], modelName = DEFAULT_MODEL): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const pipe = await getPipeline(modelName);

  const results: Float32Array[] = [];

  // Process in batches of 32 to avoid OOM on large inputs
  const BATCH_SIZE = 32;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const output = await pipe(batch, { pooling: 'mean', normalize: true });
      // output.data is a flat Float32Array; split into per-text vectors
      const dim = output.data.length / batch.length;
      for (let j = 0; j < batch.length; j++) {
        results.push(output.data.slice(j * dim, (j + 1) * dim) as Float32Array);
      }
    } catch (err) {
      throw new EmbeddingError(`Embedding batch ${i}–${i + batch.length - 1} failed`, {
        cause: err,
      });
    }
  }

  return results;
}

/**
 * Reset the cached pipeline (useful in tests).
 */
export function resetPipeline(): void {
  pipelineInstance = null;
}
