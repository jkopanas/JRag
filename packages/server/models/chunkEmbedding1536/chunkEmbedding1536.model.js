const { BaseModel, modelJsonSchemaTypes } = require('@coko/server')

const { uuid, string } = modelJsonSchemaTypes

class ChunkEmbedding1536 extends BaseModel {
  static get tableName() {
    return 'chunk_embeddings_1536'
  }

  constructor(properties) {
    super(properties)
    this.type = 'ChunkEmbedding1536'
  }

  static get schema() {
    return {
      required: ['chunkId', 'embedding'],
      properties: {
        chunkId: uuid,
        embedding: 'vector(1536)', // pgvector type
        created: string,
        updated: string,
      },
    }
  }

  static get relationMappings() {
    /* eslint-disable global-require */
    const Chunk = require('../chunk/chunk.model')
    /* eslint-enable global-require */

    return {
      chunk: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Chunk,
        join: {
          from: 'chunk_embeddings_1536.chunk_id',
          to: 'chunks.id',
        },
      },
    }
  }
}

module.exports = ChunkEmbedding1536
