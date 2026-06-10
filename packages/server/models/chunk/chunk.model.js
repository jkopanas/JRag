const { BaseModel, modelJsonSchemaTypes, useTransaction, db } = require('@coko/server')
const Document = require('../document/document.model')

const { id, string, arrayOfStrings, integerPositive, stringNullable } = modelJsonSchemaTypes

class Chunk extends BaseModel {
  static get tableName() {
    return 'chunks'
  }

  constructor(properties) {
    super(properties)
    this.type = 'Chunk'
  }

  static get schema() {
    return {
      required: ['documentId', 'collectionId', 'chunkIndex', 'text', 'overlapBefore', 'overlapAfter'],
      properties: {
        id,
        documentId: id,
        collectionId: id,
        chunkIndex: { ...integerPositive, minimum: 0 },
        text: string,
        tokens: { ...integerPositive, minimum: 0 },
        overlapBefore: { ...integerPositive, minimum: 0 },
        overlapAfter: { ...integerPositive, minimum: 0 },
        sectionPath: { ...arrayOfStrings, type: ['array', 'null'], default: null },
        pageNo: { ...integerPositive, minimum: 0 },
        meta: stringNullable,
        tsv: string,
      },
    }
  }

  static get relationMappings() {
    /* eslint-disable global-require */
    const Document = require('../document/document.model')
    const Collection = require('../collection/collection.model')
    const ChunkEmbedding1536 = require('../chunkEmbedding1536/chunkEmbedding1536.model')
    /* eslint-enable global-require */

    return {
      document: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Document,
        join: {
          from: 'chunks.document_id',
          to: 'documents.id',
        },
      },
      collection: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: Collection,
        join: {
          from: 'chunks.collection_id',
          to: 'collections.id',
        },
      },
      embedding1536: {
        relation: BaseModel.HasOneRelation,
        modelClass: ChunkEmbedding1536,
        join: {
          from: 'chunks.id',
          to: 'chunk_embeddings_1536.chunk_id',
        },
      },
    }
  }

  /**
   * Vector search within a collection (cosine distance via pgvector).
   * Options:
   *  - topK (default 20)
   *  - neighborWindow (e.g., 1 to include ±1 neighbors)
   *  - filters: object with simple WHEREs on chunks.meta etc.
   * Returns: ordered list of {chunk, distance}
   */
  static async vectorSearchInCollection({ collectionId, queryVec, topK = 20, neighborWindow = 0, filters = {} }) {
    // Resolve space to get correct embeddings table.
    const Collection = require('../collection/collection.model')
    const collection = await Collection.query().findById(collectionId)
    if (!collection) throw new Error('collection not found')
    const { space, embeddingsTable } = await collection.resolveSpace()

    // Where clause for filters (simple example on meta keys).
    const where = ['c.collection_id = ?',]
    const params = [collectionId]

    if (filters && filters.metaPath && typeof filters.metaEquals !== 'undefined') {
      where.push(`(c.meta #>> ?) = ?`)
      params.push(filters.metaPath, String(filters.metaEquals))
    }

    // Base hits by cosine distance (operator <=>); lower is better.
    // Convert Float32Array to string format expected by pgvector
    const queryVecString = `[${Array.from(queryVec).join(',')}]`

    // Build the query using raw SQL with Knex-compatible parameter binding
    const whereClause = where.join(' AND ')
    
    const sql = `
      SELECT 
        c.id,
        c.collection_id as "collectionId",
        c.document_id as "documentId", 
        c.chunk_index as "chunkIndex",
        c.text,
        cosine_distance(e.embedding, ?::vector) AS distance
      FROM ${embeddingsTable} as e
      INNER JOIN chunks as c ON c.id = e.chunk_id
      WHERE ${whereClause}
      ORDER BY distance ASC
      LIMIT ?
    `
    
    const queryParams = [queryVecString, ...params, Number(topK)]
    const query = db.raw(sql, queryParams)
    
    let hits
    try {
      hits = await query
      console.log(`Query successful: returned ${hits.length} results`)
    } catch (error) {
      console.error('Vector search query failed:', error.message)
      console.error('Full error:', error)
      throw error
    }
    
     if (!neighborWindow || neighborWindow <= 0 || hits.length === 0) {
       return hits.rows
     }

           // Expand neighbors: for each hit, include ±window chunks from same doc.
      const expanded = []
      for (const h of hits.rows) {
        const neighbors = await Chunk.query()
          .where('documentId', h.documentId)
          .andWhere('collectionId', h.collectionId)
          .andWhereBetween('chunkIndex', [h.chunkIndex - neighborWindow, h.chunkIndex + neighborWindow])
          .orderBy('chunkIndex', 'asc')

        // Add distance to each neighbor
        neighbors.forEach(n => n.distance = h.distance)
        expanded.push(...neighbors)
      }

    // Deduplicate by chunk id, keep best (lowest) distance, stable order by distance then index.
    const bestById = new Map()
    for (const row of expanded) {
      if (!bestById.has(row.id) || row.distance < bestById.get(row.id).distance) {
        bestById.set(row.id, row)
      }
    }
    return Array.from(bestById.values()).sort((a, b) => (a.distance - b.distance) || (a.chunk_index - b.chunk_index))
  }

  /**
   * Hybrid retrieval: fuse BM25 (tsv) with vector score.
   * Strategy: grab topN from each, normalize, then fuse = vec_norm + bm25_norm.
   */
  static async hybridSearchInCollection({
    collectionId,
    queryText,
    queryVec,
    topVec = 20,
    topBm25 = 20,
    finalK = 10,
    neighborWindow = 0
  }) {
    const Collection = require('../collection/collection.model')
    const collection = await Collection.query().findById(collectionId)
    if (!collection) throw new Error('collection not found')
    const { embeddingsTable } = await collection.resolveSpace()

         // BM25 candidates
     const bm25Rows = await db
       .select('id', db.raw(`ts_rank(tsv, plainto_tsquery('english', ?)) AS bm25_score`, [queryText]))
       .from('chunks')
       .where('collection_id', collectionId)
       .andWhere(db.raw(`tsv @@ plainto_tsquery('english', ?)`, [queryText]))
       .orderBy('bm25_score', 'desc')
       .limit(topBm25)

         // Vector candidates
     // Convert Float32Array to string format expected by pgvector
     const queryVecString = `[${Array.from(queryVec).join(',')}]`
     const vecRows = await db
       .select(
         'c.id',
         db.raw('(1 - (e.embedding <=> ?)) AS vec_score', [queryVecString])
       )
       .from(`${embeddingsTable} as e`)
       .join('chunks as c', 'c.id', 'e.chunk_id')
       .where('c.collection_id', collectionId)
       .orderBy('vec_score', 'desc')
       .limit(Number(topVec))

    // Normalize scores 0..1
    const norm = (rows, key) => {
      if (rows.length === 0) return rows
      const max = Math.max(...rows.map(r => Number(r[key] || 0)))
      const min = Math.min(...rows.map(r => Number(r[key] || 0)))
      const denom = (max - min) || 1
      return rows.map(r => ({ ...r, [key]: (Number(r[key] || 0) - min) / denom }))
    }
    const bm25N = norm(bm25Rows, 'bm25_score')
    const vecN = norm(vecRows, 'vec_score')

    // Merge by id with simple sum fusion
    const byId = new Map()
    for (const r of bm25N) {
      byId.set(r.id, { id: r.id, bm25: r.bm25_score || 0, vec: 0 })
    }
    for (const r of vecN) {
      const prev = byId.get(r.id) || { id: r.id, bm25: 0, vec: 0 }
      prev.vec = r.vec_score || 0
      byId.set(r.id, prev)
    }
    const fused = Array.from(byId.values())
      .map(r => ({ id: r.id, fused: r.vec + r.bm25, bm25: r.bm25, vec: r.vec }))
      .sort((a, b) => b.fused - a.fused)
      .slice(0, finalK)

    // Load rows and optionally expand neighbors
    const rows = await Chunk.query().whereIn('id', fused.map(r => r.id))
    const rowsById = Object.fromEntries(rows.map(r => [r.id, r]))

    let results = fused.map(r => ({ ...rowsById[r.id], fused: r.fused }))
    if (neighborWindow && neighborWindow > 0) {
      const expanded = []
      for (const row of results) {
                const neighbors = await Chunk.query()
          .where('document_id', row.document_id)
          .andWhere('collection_id', collectionId)
          .andWhereBetween('chunk_index', [row.chunk_index - neighborWindow, row.chunk_index + neighborWindow])
          .orderBy('chunk_index', 'asc')
        expanded.push(...neighbors)
      }
      // Dedup
      const seen = new Map()
      for (const r of [...results, ...expanded]) {
        if (!seen.has(r.id)) seen.set(r.id, r)
      }
      results = Array.from(seen.values())
    }
    // Sort by fused desc if present, else keep doc order
    return results
  }

  /**
   * Vector search for chunks by embedding vector
   * @param {Object} trx - Database transaction
   * @param {Object} options - Search options
   * @param {string} options.collectionId - Collection ID to search in
   * @param {Float32Array} options.vector - Query vector for similarity search
   * @param {number} options.limit - Maximum number of results to return
   * @param {string} options.spaceId - Space ID for embeddings table resolution
   * @param {Object} options.filters - Additional filters (optional)
   * @returns {Array} Array of chunk results with distance scores
   */
  static async searchByVector(trx, options = {}) {
    const { collectionId, vector, limit = 20, spaceId, filters = {} } = options

    if (!collectionId || !vector) {
      throw new Error('collectionId and vector are required')
    }

    // Resolve space to get correct embeddings table
    const Collection = require('../collection/collection.model')
    const collection = await Collection.query(trx).findById(collectionId)
    if (!collection) throw new Error('collection not found')
    const { embeddingsTable } = await collection.resolveSpace(trx)

    // Where clause for filters
    const where = ['c.collection_id = ?']
    const params = [collectionId]

    if (filters && filters.metaPath && typeof filters.metaEquals !== 'undefined') {
      where.push(`(c.meta #>> ?) = ?`)
      params.push(filters.metaPath, String(filters.metaEquals))
    }

    // Convert Float32Array to string format expected by pgvector
    const queryVecString = `[${Array.from(vector).join(',')}]`

    // Build the query using raw SQL with Knex-compatible parameter binding
    const whereClause = where.join(' AND ')
    
    const sql = `
      SELECT 
        c.id,
        c.collection_id as "collectionId",
        c.document_id as "documentId", 
        c.chunk_index as "chunkIndex",
        c.text,
        c.tokens,
        c.overlap_before as "overlapBefore",
        c.overlap_after as "overlapAfter",
        c.section_path as "sectionPath",
        c.page_no as "pageNo",
        c.meta,
        c.tsv,
        cosine_distance(e.embedding, ?::vector) AS distance
      FROM ${embeddingsTable} as e
      INNER JOIN chunks as c ON c.id = e.chunk_id
      WHERE ${whereClause}
      ORDER BY distance ASC
      LIMIT ?
    `
    
    const queryParams = [queryVecString, ...params, Number(limit)]
    const query = db.raw(sql, queryParams)
    
    try {
      const hits = await query
      return hits.rows
    } catch (error) {
      console.error('Vector search query failed:', error.message)
      throw error
    }
  }

  /**
   * Text search for chunks using full-text search (BM25)
   * @param {Object} trx - Database transaction
   * @param {Object} options - Search options
   * @param {string} options.collectionId - Collection ID to search in
   * @param {string} options.query - Text query for full-text search
   * @param {number} options.limit - Maximum number of results to return
   * @param {number} options.titleBoost - Boost factor for title matches (default: 1.0)
   * @param {number} options.subjectBoost - Boost factor for subject matches (default: 1.0)
   * @param {number} options.fromBoost - Boost factor for from field matches (default: 1.0)
   * @returns {Array} Array of chunk results with BM25 scores
   */
  static async searchByText(trx, options = {}) {
    const { 
      collectionId, 
      query, 
      limit = 20, 
      titleBoost = 1.0, 
      subjectBoost = 1.0, 
      fromBoost = 1.0 
    } = options

    if (!collectionId || !query) {
      throw new Error('collectionId and query are required')
    }

    try {
      // Build the boost calculation based on metadata fields
      let boostCalculation = 'ts_rank(tsv, plainto_tsquery(?, ?))'
      const boostParams = ['english', query]
      
      // Add field-specific boosts if they differ from 1.0
      if (titleBoost !== 1.0 || subjectBoost !== 1.0 || fromBoost !== 1.0) {
        boostCalculation += ' * ('
        const boostParts = []
        
        if (titleBoost !== 1.0) {
          boostParts.push(`CASE WHEN (meta #>> '{title}') IS NOT NULL THEN ${titleBoost} ELSE 1.0 END`)
        }
        
        if (subjectBoost !== 1.0) {
          boostParts.push(`CASE WHEN (meta #>> '{subject}') IS NOT NULL THEN ${subjectBoost} ELSE 1.0 END`)
        }
        
        if (fromBoost !== 1.0) {
          boostParts.push(`CASE WHEN (meta #>> '{from}') IS NOT NULL THEN ${fromBoost} ELSE 1.0 END`)
        }
        
        if (boostParts.length > 0) {
          boostCalculation += boostParts.join(' * ')
        } else {
          boostCalculation += '1.0'
        }
        
        boostCalculation += ')'
      }

      const results = await db
        .select(
          'id',
          'collection_id as collectionId',
          'document_id as documentId',
          'chunk_index as chunkIndex',
          'text',
          'tokens',
          'overlap_before as overlapBefore',
          'overlap_after as overlapAfter',
          'section_path as sectionPath',
          'page_no as pageNo',
          'meta',
          'tsv',
          db.raw(`${boostCalculation} AS bm25_score`, boostParams)
        )
        .from('chunks')
        .where('collection_id', collectionId)
        .andWhere(db.raw(`tsv @@ plainto_tsquery(?, ?)`, ['english', query]))
        .orderBy('bm25_score', 'desc')
        .limit(Number(limit))

      return results
    } catch (error) {
      console.error('Text search query failed:', error.message)
      throw error
    }
  }

  /**
   * Ingest helper: insert Document, Chunks, and Vectors in a transaction (batched).
   * @param collectionId
   * @param docPayload { source_uri, mime, language, meta }
   * @param chunkRecords array of { chunk_index, text, tokens?, overlap_before?, overlap_after?, section_path?, page_no?, meta? }
   * @param vectors Float32Array[] (same length as chunkRecords)
   */
  static async updateDocumentWithChunksAndVectors({
    collectionId,
    docPayload,
    chunkRecords,
    vectors
  }) {
    if (!Array.isArray(chunkRecords) || !Array.isArray(vectors) || chunkRecords.length !== vectors.length) {
      throw new Error('chunkRecords and vectors must be same length arrays')
    }

    return await useTransaction(async trx => {
        // Convert snake_case payload to camelCase for the model
        const docPayloadCamel = {
        id: docPayload.documentId,
        collectionId: collectionId,
        sourceUri: docPayload.source_uri,
        mime: docPayload.mime,
        language: docPayload.language,
        meta: docPayload.meta,
        status: 'QUEUED',
        processingStartedAt: new Date().toISOString(),
        processingCompletedAt: null,
        processingFailedAt: null,
        error: null,
        chunksInserted: 0,
        embeddingsInserted: 0
      }

      const doc = await Document.query(trx).patchAndFetchById(docPayloadCamel.id, docPayloadCamel)

      const documentId = doc.id

      // Insert chunks
      const chunkRows = chunkRecords.map(c => ({
        documentId: documentId,
        collectionId: collectionId,
        chunkIndex: c.chunk_index || 0,
        text: c.text,
        tokens: parseInt(c.tokens) || 0,
        overlapBefore: parseInt(c.overlap_before) || 0,
        overlapAfter: parseInt(c.overlap_after) || 0,
        sectionPath: c.section_path || null,
        pageNo: parseInt(c.page_no) || 0,
        meta: c.meta ? JSON.stringify(c.meta) : null
      }))

      const inserted = await Chunk.query(trx).insert(chunkRows).returning(['id', 'chunkIndex'])

      const idByIndex = Object.fromEntries(inserted.map(r => [r.chunkIndex, r.id]))

      // Resolve embeddings table
      const Collection = require('../collection/collection.model')
      const collection = await Collection.query(trx).findById(collectionId)
      const { space, embeddingsTable } = await collection.resolveSpace(trx)

      // Batch insert vectors
      const rows = vectors.map((vec, i) => ({
        chunk_id: idByIndex[chunkRecords[i].chunk_index],
        embedding: `[${Array.from(vec).join(',')}]`, // Convert to vector string format
        type: 'ChunkEmbedding1536'
      }))

      // Insert in chunks (Postgres can handle large, but be safe)
      const batchSize = 500
      for (let i = 0; i < rows.length; i += batchSize) {
        await trx.batchInsert(embeddingsTable, rows.slice(i, i + batchSize), batchSize)
      }

      return { documentId, chunksInserted: inserted.length, embeddingsInserted: rows.length, dim: space.dim }
    })
  }
}

module.exports = Chunk
