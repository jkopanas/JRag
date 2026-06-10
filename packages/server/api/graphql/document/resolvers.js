const { subscriptionManager } = require('@coko/server')
const Document = require('../../../models/document/document.model')

const resolvers = {
  Query: {
    documents: async (_, { userId, collectionId }) =>
      Document.findByUserAndCollection(userId, collectionId),

    document: async (_, { userId, id }) =>
      Document.findByIdForUser(userId, id),
  },
  Subscription: {
    documentProcessingUpdate: {
      subscribe: async (_, { jobId }) => {
        // Subscribe to updates for a specific job
        return subscriptionManager.asyncIterator(`DOCUMENT_PROCESSING_UPDATE_${jobId}`)
      }
    }
  }
}

module.exports = resolvers
