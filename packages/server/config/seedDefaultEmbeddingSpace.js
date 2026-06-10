
/**
 * Seeds a default embedding space using OpenAI's text-embedding-3-small model
 * This model has 1536 dimensions and works well with pgvector indexes
 */
async function seedDefaultEmbeddingSpace() {
  const { EmbeddingSpace } = require('../models')
  
  try {
    // Check if a default embedding space already exists
    const existingSpace = await EmbeddingSpace.query()
      .where('name', 'default')
      .first()
    
    if (existingSpace) {
      return
    }

    // Create the default embedding space with OpenAI's text-embedding-3-small model
    const defaultSpace = await EmbeddingSpace.query().insert({
      name: 'default',
      provider: 'openai',
      model: 'text-embedding-3-small',
      dim: 1536, // text-embedding-3-small has 1536 dimensions
      metric: 'cosine', // Most common metric for similarity search
      description: 'Default OpenAI text-embedding-3-small model for semantic search and similarity matching'
    })
  } catch (error) {
    throw error
  }
}

module.exports = seedDefaultEmbeddingSpace
