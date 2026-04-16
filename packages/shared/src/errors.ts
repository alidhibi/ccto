/** Base error class for all CCTO errors */
export class CctoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CctoError';
  }
}

export class IndexError extends CctoError {
  constructor(message: string, options?: ErrorOptions) {
    super('INDEX_ERROR', message, options);
    this.name = 'IndexError';
  }
}

export class StoreError extends CctoError {
  constructor(message: string, options?: ErrorOptions) {
    super('STORE_ERROR', message, options);
    this.name = 'StoreError';
  }
}

export class EmbeddingError extends CctoError {
  constructor(message: string, options?: ErrorOptions) {
    super('EMBEDDING_ERROR', message, options);
    this.name = 'EmbeddingError';
  }
}

export class ConfigError extends CctoError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONFIG_ERROR', message, options);
    this.name = 'ConfigError';
  }
}
