const OpenAIEmbeddingClient = require('./OpenAIEmbeddingClient')
/**
 * Factory service for creating embedding clients
 * Automatically selects the appropriate client based on the embedding space provider
 */
class EmbeddingService {
  constructor() {
    this.clients = new Map()
    this.registerClient(OpenAIEmbeddingClient)
  }

  /**
   * Register a new embedding client type
   * @param {Class} ClientClass - The embedding client class to register
   */
  registerClient(ClientClass) {
    this.clients.set(ClientClass.provider, ClientClass)
  }

  /**
   * Create an embedding client for the given space
   * @param {Object} space - The embedding space configuration
   * @param {Object} options - Additional options for the client
   * @returns {EmbeddingClient} The appropriate embedding client instance
   */
  createClient(space, options = {}) {
    const ClientClass = this.clients.get(space.provider)
    
    if (!ClientClass) {
      throw new Error(`No embedding client registered for provider: ${space.provider}`)
    }

    return new ClientClass({ space, ...options })
  }

  /**
   * Get all available provider names
   * @returns {string[]} Array of available provider names
   */
  getAvailableProviders() {
    return Array.from(this.clients.keys())
  }

  /**
   * Check if a provider is supported
   * @param {string} provider - Provider name to check
   * @returns {boolean} True if the provider is supported
   */
  isProviderSupported(provider) {
    return this.clients.has(provider)
  }
}

// Export the class instead of an instance to avoid circular dependency
module.exports = EmbeddingService
