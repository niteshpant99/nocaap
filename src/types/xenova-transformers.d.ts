/**
 * Type declarations for @xenova/transformers (optional dependency)
 * Minimal types for the embedding pipeline functionality we use
 */
declare module '@xenova/transformers' {
  export interface PipelineOutput {
    data: Float32Array;
  }

  export type FeatureExtractionPipeline = (
    text: string,
    options?: { pooling?: string; normalize?: boolean }
  ) => Promise<PipelineOutput>;

  export function pipeline(
    task: 'feature-extraction',
    model: string
  ): Promise<FeatureExtractionPipeline>;
}
