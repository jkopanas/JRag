const { uuid } = require('@coko/server')
// const Chunk = require('../../../models/chunk/chunk.model')
const Collection = require('../../../models/collection/collection.model')
const Document = require('../../../models/document/document.model')
const RetrievalService = require('../../../services/retrieval/RetrievalService')
const { getAvailableStrategies: getAvailableChunkingStrategies } = require('../../../services/chunk/textChunkerStrategies')
const { getAvailableStrategies: getAvailableRetrievalStrategies } = require('../../../services/retrieval/retrievalStrategies')
const resolvers = {
  Query: {
    retrieve: async (_, { input }) => {
      try {
        const { userId, collectionId, query, topK, neighborWindow, strategy, minScore } = input

        // Validate collection exists and user has access
        const collection = await Collection.getCollectionOrDefault({ userId, collectionId })

        const retrievalService = new RetrievalService()
        const searchResults = await retrievalService.retrieve({
          collectionId: collection.id,
          query,
          strategy,
        })

        const filteredResults = searchResults.filter(result => {
          const similarity = 1 - (result.distance / 2)
          return similarity >= minScore
        })

        // Get document information for the chunks
        const documentIds = [...new Set(filteredResults.map(r => r.documentId).filter(id => id != null))]
        
        let documents = []
        if (documentIds.length > 0) {
          documents = await Document.query()
            .whereIn('id', documentIds)
            .select('id', 'source_uri', 'meta')
        }

        const documentsById = Object.fromEntries(
          documents.map(doc => [doc.id, doc])
        )

        // Format results according to GraphQL schema
        const results = filteredResults.map(chunk => {
          const document = documentsById[chunk.documentId]
          const score = chunk.fused || (1 - chunk.distance) || chunk.vec_score || 0
          
          return {
            chunkId: chunk.id,
            documentId: chunk.documentId,
            collectionId: chunk.collectionId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            sectionPath: chunk.sectionPath || [],
            sourceUri: document ? document.source_uri : null,
            title: document && document.meta ? document.meta.title : null,
            score: Math.max(0, Math.min(1, score)) // Ensure score is between 0 and 1
          }
        })

        return {
          query,
          results,
          stats: {
            topK,
            neighborWindow,
            usedEmbeddingSpaceId: collection.embeddingSpace.id,
            strategy
          }
        }
      } catch (error) {
        console.error('Retrieve resolver error:', error)
        throw new Error(`Retrieval failed: ${error.message}`)
      }
    },

    getStrategies: async (_, { type }) => {
      try {
        let strategies = []
        if (type === 'chunking') {
          strategies = getAvailableChunkingStrategies()
        } else if (type === 'retrieval') {
          strategies = getAvailableRetrievalStrategies()
        } else {
          return []
        }

        return strategies.map(strategy => ({
          id: uuid(),
          type,
          key: strategy.key,
          name: strategy.name,
          description: strategy.description
        }))
      } catch (error) {
        throw new Error(`Failed to fetch text chunking strategies: ${error.message}`)
      }
    },
  }
}

module.exports = resolvers
