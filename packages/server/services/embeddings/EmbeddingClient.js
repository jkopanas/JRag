/**
 * Base class for embedding clients
 * Provides a common interface for different embedding providers
 */
class EmbeddingClient {
  constructor({ space }) {
    this.space = space // { provider, model, dim }
  }

  /**
   * Embed a batch of texts into vectors
   * @param {string[]} texts - Array of text chunks to embed
   * @returns {Promise<Float32Array[]>} Array of embedding vectors
   */
  async embedBatch(texts) { 
    throw new Error('embedBatch method not implemented') 
  }

  /**
   * Validate that the embedding space is compatible with this client
   * @param {Object} space - The embedding space configuration
   * @returns {boolean} True if compatible
   */
  isCompatible(space) {
    return space.provider === this.constructor.provider
  }

  /**
   * Get the provider name for this client
   * @returns {string} Provider name
   */
  static get provider() {
    throw new Error('provider static property not implemented')
  }
}

module.exports = EmbeddingClient
