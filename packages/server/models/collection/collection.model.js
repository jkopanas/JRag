const { BaseModel, modelJsonSchemaTypes } = require('@coko/server')
const EmbeddingSpace = require('../embeddingSpace/embeddingSpace.model')

const { id, string, boolean } = modelJsonSchemaTypes

class Collection extends BaseModel {
  static get tableName() {
    return 'collections'
  }

  constructor(properties) {
    super(properties)
    this.type = 'Collection'
  }

  static get schema() {
    return {
      required: ['userId', 'name', 'embeddingSpaceId'],
      properties: {
        userId: id,
        name: string,
        description: string,
        embeddingSpaceId: id,
        isSystem: boolean,
      },
    }
  }


  static get relationMappings() {
    /* eslint-disable global-require */
    const EmbeddingSpace = require('../embeddingSpace/embeddingSpace.model')
    const Document = require('../document/document.model')
    const Chunk = require('../chunk/chunk.model')
    /* eslint-enable global-require */

    return {
      embeddingSpace: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: EmbeddingSpace,
        join: {
          from: 'collections.embeddingSpaceId',
          to: 'embedding_spaces.id',
        },
      },
      documents: {
        relation: BaseModel.HasManyRelation,
        modelClass: Document,
        join: {
          from: 'collections.id',
          to: 'documents.collection_id',
        },
      },
      chunks: {
        relation: BaseModel.HasManyRelation,
        modelClass: Chunk,
        join: {
          from: 'collections.id',
          to: 'chunks.collection_id',
        },
      },
    }
  }

  /** Resolve embeddings table + dim + metric for this collection. */
  async resolveSpace() {
    const space = await this.$relatedQuery('embeddingSpace')
    const table = EmbeddingSpace.tableForDim(space.dim)
    return { space, embeddingsTable: table }
  }

  /** Create a collection safely ensuring the embedding_space exists. */
  static async createForUser({ userId, name, embeddingSpaceId, description }) {
    const EmbeddingSpace = require('../embeddingSpace/embeddingSpace.model')
    
    // Check if a collection with the same userId and name already exists
    const existingCollection = await Collection.query()
      .where({ userId, name })
      .first()
    
    if (existingCollection) {
      throw new Error(`Collection with name "${name}" already exists for this user`)
    }
    
    let space
    
    if (embeddingSpaceId) {
      space = await EmbeddingSpace.findById(embeddingSpaceId)
    } else {
      // If no embeddingSpaceId provided, find the default space by name
      space = await EmbeddingSpace.query().where({ name: 'default' }).first()
      if (!space) throw new Error('default embedding space not found')
      embeddingSpaceId = space.id
    }

    return await Collection.query().insert({
      userId,
      name,
      description: description || null,
      embeddingSpaceId,
      isSystem: false,
    }).returning('*')
  }

  static async getCollectionOrDefault({ userId, collectionId }) {
    if (!collectionId) {
      const existingCollection = await Collection.insertDefaultCollection({ userId })
      collectionId = existingCollection.id
    }

    return await Collection.query().where({ id: collectionId, userId }).withGraphFetched('embeddingSpace').first()
  }

  /** Insert a default collection for a user if it doesn't exist. */
  static async insertDefaultCollection({ userId, description = 'Default collection for storing documents' }) {
    const EmbeddingSpace = require('../embeddingSpace/embeddingSpace.model')
    // Check if default collection already exists for this user
    const existingCollection = await Collection.query().where({'userId': userId, 'name': 'default'}).first()
    
    if (existingCollection) {
      return existingCollection
    }

    // Find the default embedding space
    const defaultSpace = await EmbeddingSpace.query().where('name', 'default').first()
    if (!defaultSpace) {
      throw new Error('Default embedding space not found')
    }

    // Use createForUser to create the collection, then update it to be a system collection
    const collection = await Collection.createForUser({
      userId,
      name: 'default',
      embeddingSpaceId: defaultSpace.id,
      description
    })

    // Update to mark as system collection
    return await Collection.query()
      .patch({ isSystem: true })
      .where('id', collection.id)
      .returning('*')
      .first()
  }
}

module.exports = Collection
