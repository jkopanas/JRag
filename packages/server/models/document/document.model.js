const { BaseModel, modelJsonSchemaTypes } = require('@coko/server')

const { id, string, stringNullable, integerPositive } = modelJsonSchemaTypes

class Document extends BaseModel {
  static get tableName() {
    return 'documents'
  }

  constructor(properties) {
    super(properties)
    this.type = 'Document'
  }

  static get schema() {
    return {
      required: ['collectionId'],
      properties: {
        id,
        collectionId: id,
        sourceUri: string,
        mime: string,
        language: string,
        meta: stringNullable,
        status: string, // QUEUED, PROCESSING, COMPLETED, FAILED
        processingStartedAt: stringNullable,
        processingCompletedAt: stringNullable,
        processingFailedAt: stringNullable,
        error: stringNullable,
        chunksInserted: { ...integerPositive, minimum: 0 },
        embeddingsInserted: { ...integerPositive, minimum: 0 },
      },
    }
  }

  static get relationMappings() {
    /* eslint-disable global-require */
    const Collection = require('../collection/collection.model')
    const Chunk = require('../chunk/chunk.model')
    /* eslint-enable global-require */

    return {
      collection: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Collection,
        join: {
          from: 'documents.collection_id',
          to: 'collections.id',
        },
      },
      chunks: {
        relation: BaseModel.HasManyRelation,
        modelClass: Chunk,
        join: {
          from: 'documents.id',
          to: 'chunks.document_id',
        },
      },
    }
  }

  /** Find documents for a specific user and collection using relationships */
  static async findByUserAndCollection(userId, collectionId) {
    return this.query()
      .joinRelated('collection')
      .where({
        'collection_id': collectionId,
        'collection.user_id': userId
      })
  }

  /** Find a specific document by ID for a specific user using relationships */
  static async findByIdForUser(userId, documentId) {
    return this.query()
      .joinRelated('collection')
      .where({
        'documents.id': documentId,
        'collection.user_id': userId
      })
      .first()
  }
}

module.exports = Document
