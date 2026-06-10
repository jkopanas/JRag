const EmbeddingClient = require('./EmbeddingClient')
const OpenAI = require('openai')

class OpenAIEmbeddingClient extends EmbeddingClient {
  constructor({ space, apiKey }) {
    super({ space })
    
    // Lazy load config to avoid circular dependency
    const config = require('config')
    
    this.client = new OpenAI({
      apiKey: apiKey || config.get('openAiApiKey'),
    })
  }

  /**
   * Embed a batch of texts using OpenAI's embedding API
   * @param {string[]} texts - Array of text chunks to embed
   * @returns {Promise<Float32Array[]>} Array of embedding vectors
   */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      return []
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.space.model,
        input: texts,
        encoding_format: 'float'
      })

      // Return Float32Array[] matching texts
      return response.data.map(item => new Float32Array(item.embedding))
    } catch (error) {
      throw new Error(`OpenAI embeddings failed: ${error.message}`)
    }
  }

  /**
   * Get the provider name for this client
   * @returns {string} Provider name
   */
  static get provider() {
    return 'openai'
  }
}

module.exports = OpenAIEmbeddingClient
