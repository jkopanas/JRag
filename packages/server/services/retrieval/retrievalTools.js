const Chunk = require('../../models/chunk/chunk.model')

/**
 * Retrieval tools implementation
 * Each tool is a function that takes (results, context, options) and returns processed results
 */

const tools = {
  /**
   * Hybrid search combining dense and sparse retrieval
   */
  hybrid: {
    name: 'Hybrid Search',
    description: 'Combines dense vector search with sparse keyword search',
    async execute(results, context, options = {}) {
      const { collectionId, query, embedder, space, trx } = context
      const { kVec = 50, kSparse = 50 } = options

      // Dense vector search
      const queryVector = (await embedder.embedBatch([query]))[0]
      const vectorResults = await Chunk.searchByVector(trx, {
        collectionId,
        vector: queryVector,
        limit: kVec,
        spaceId: space.id
      })

      // Sparse keyword search (simplified - in real implementation would use BM25)
      const sparseResults = await Chunk.searchByText(trx, {
        collectionId,
        query,
        limit: kSparse
      })

      // Combine and score results
      const combinedResults = this._combineResults(vectorResults, sparseResults, {
        vectorWeight: 0.7,
        sparseWeight: 0.3
      })

      return combinedResults
    },

    _combineResults(vectorResults, sparseResults, weights) {
      const resultMap = new Map()
      
      // Add vector results
      vectorResults.forEach((result, index) => {
        const score = (1 - index / vectorResults.length) * weights.vectorWeight
        resultMap.set(result.id, { ...result, score, source: 'vector' })
      })
      
      // Add sparse results
      sparseResults.forEach((result, index) => {
        const score = (1 - index / sparseResults.length) * weights.sparseWeight
        const existing = resultMap.get(result.id)
        if (existing) {
          existing.score += score
          existing.source = 'hybrid'
        } else {
          resultMap.set(result.id, { ...result, score, source: 'sparse' })
        }
      })
      
      return Array.from(resultMap.values()).sort((a, b) => b.score - a.score)
    }
  },

  /**
   * Dense vector search only
   */
  vector: {
    name: 'Vector Search',
    description: 'Dense vector similarity search',
    async execute(results, context, options = {}) {
      const { collectionId, query, embedder, space, trx } = context
      const { k = 50 } = options

      const queryVector = (await embedder.embedBatch([query]))[0]
      const vectorResults = await Chunk.searchByVector(trx, {
        collectionId,
        vector: queryVector,
        limit: k,
        spaceId: space.id
      })

      return vectorResults.map((result, index) => ({
        ...result,
        score: 1 - index / vectorResults.length,
        source: 'vector'
      }))
    }
  },

  /**
   * Sparse keyword search only
   */
  sparse: {
    name: 'Sparse Search',
    description: 'Keyword-based sparse search',
    async execute(results, context, options = {}) {
      const { collectionId, query, trx } = context
      const { k = 50, keywordHeavy = false, titleBoost = 1.0, subjectBoost = 1.0, fromBoost = 1.0 } = options

      const sparseResults = await Chunk.searchByText(trx, {
        collectionId,
        query,
        limit: k,
        titleBoost,
        subjectBoost,
        fromBoost
      })

      return sparseResults.map((result, index) => ({
        ...result,
        score: 1 - index / sparseResults.length,
        source: 'sparse'
      }))
    }
  },

  /**
   * Multi-query expansion
   */
  multiQuery: {
    name: 'Multi-Query',
    description: 'Generates multiple query variations for better coverage',
    async execute(results, context, options = {}) {
      const { query, embedder, space, trx } = context
      const { numQueries = 3, translations = false } = options

      // Generate query variations (simplified - in real implementation would use LLM)
      const queryVariations = this._generateQueryVariations(query, numQueries, translations)
      
      // Execute each query variation
      const allResults = []
      for (const variation of queryVariations) {
        const queryVector = (await embedder.embedBatch([variation]))[0]
        const variationResults = await Chunk.searchByVector(trx, {
          collectionId: context.collectionId,
          vector: queryVector,
          limit: Math.ceil(context.limit / numQueries),
          spaceId: space.id
        })
        allResults.push(...variationResults)
      }

      return allResults
    },

    _generateQueryVariations(query, numQueries, translations) {
      // Simplified query generation - in real implementation would use LLM
      const variations = [query]
      
      if (numQueries > 1) {
        variations.push(`${query} examples`)
        variations.push(`how to ${query}`)
      }
      
      if (numQueries > 3) {
        variations.push(`what is ${query}`)
        variations.push(`${query} tutorial`)
      }
      
      return variations.slice(0, numQueries)
    }
  },

  /**
   * Hypothetical Document Embeddings (HyDE)
   */
  hyde: {
    name: 'HyDE',
    description: 'Hypothetical Document Embeddings for better retrieval',
    async execute(results, context, options = {}) {
      const { query, embedder, space, trx } = context
      const { generateHypothetical = true } = options

      if (!generateHypothetical) {
        return results
      }

      // Generate hypothetical document (simplified - in real implementation would use LLM)
      const hypotheticalDoc = this._generateHypotheticalDocument(query)
      const hypotheticalVector = (await embedder.embedBatch([hypotheticalDoc]))[0]
      
      const hydeResults = await Chunk.searchByVector(trx, {
        collectionId: context.collectionId,
        vector: hypotheticalVector,
        limit: context.limit,
        spaceId: space.id
      })

      return hydeResults.map((result, index) => ({
        ...result,
        score: 1 - index / hydeResults.length,
        source: 'hyde'
      }))
    },

    _generateHypotheticalDocument(query) {
      // Simplified hypothetical document generation
      return `This document discusses ${query}. It provides detailed information about ${query} including examples, use cases, and best practices. The content covers various aspects of ${query} and explains how it works.`
    }
  },

  /**
   * Reciprocal Rank Fusion for combining multiple result sets
   */
  rrf: {
    name: 'Reciprocal Rank Fusion',
    description: 'Combines multiple result sets using reciprocal rank fusion',
    async execute(results, context, options = {}) {
      const { k = 60 } = options
      
      if (results.length === 0) {
        return results
      }

      // Group results by source if they have source information
      const resultGroups = this._groupResultsBySource(results)
      
      if (resultGroups.length < 2) {
        return results.slice(0, k)
      }

      // Apply RRF scoring
      const rrfResults = this._applyRRF(resultGroups, k)
      
      return rrfResults
    },

    _groupResultsBySource(results) {
      const groups = new Map()
      
      results.forEach(result => {
        const source = result.source || 'default'
        if (!groups.has(source)) {
          groups.set(source, [])
        }
        groups.get(source).push(result)
      })
      
      return Array.from(groups.values())
    },

    _applyRRF(resultGroups, k) {
      const resultMap = new Map()
      const kParam = 60 // RRF parameter
      
      resultGroups.forEach(group => {
        group.forEach((result, index) => {
          const rrfScore = 1 / (kParam + index + 1)
          const existing = resultMap.get(result.id)
          
          if (existing) {
            existing.score += rrfScore
            existing.sources = [...(existing.sources || []), result.source || 'unknown']
          } else {
            resultMap.set(result.id, {
              ...result,
              score: rrfScore,
              sources: [result.source || 'unknown']
            })
          }
        })
      })
      
      return Array.from(resultMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
    }
  },

  /**
   * Anchor boosting for results with anchor information
   */
  anchorBoost: {
    name: 'Anchor Boost',
    description: 'Boosts results that contain anchor information',
    async execute(results, context, options = {}) {
      const { anchorWeight = 1.1 } = options
      
      return results.map(result => {
        const hasAnchor = result.meta?.anchors && result.meta.anchors.length > 0
        const boost = hasAnchor ? anchorWeight : 1.0
        
        return {
          ...result,
          score: result.score * boost,
          anchorBoost: hasAnchor
        }
      }).sort((a, b) => b.score - a.score)
    }
  },

  /**
   * Field boosting for specific metadata fields
   */
  fieldBoost: {
    name: 'Field Boost',
    description: 'Boosts results based on specific metadata fields',
    async execute(results, context, options = {}) {
      const { fields = [], boost = 1.5 } = options
      
      if (fields.length === 0) {
        return results
      }
      
      return results.map(result => {
        let fieldBoost = 1.0
        
        fields.forEach(field => {
          if (result.meta?.[field]) {
            fieldBoost *= boost
          }
        })
        
        return {
          ...result,
          score: result.score * fieldBoost,
          fieldBoost
        }
      }).sort((a, b) => b.score - a.score)
    }
  },

  /**
   * Deduplication of similar results
   */
  dedupe: {
    name: 'Deduplication',
    description: 'Removes duplicate or near-duplicate results',
    async execute(results, context, options = {}) {
      const { threshold = 0.93 } = options
      
      if (results.length === 0) {
        return results
      }
      
      const deduped = []
      const seen = new Set()
      
      for (const result of results) {
        const isDuplicate = this._isDuplicate(result, deduped, threshold)
        
        if (!isDuplicate) {
          deduped.push(result)
          seen.add(result.id)
        }
      }
      
      return deduped
    },

    _isDuplicate(result, existing, threshold) {
      return existing.some(existing => {
        const similarity = this._calculateSimilarity(result.text, existing.text)
        return similarity > threshold
      })
    },

    _calculateSimilarity(text1, text2) {
      // Simplified similarity calculation - in real implementation would use more sophisticated methods
      const words1 = new Set(text1.toLowerCase().split(/\s+/))
      const words2 = new Set(text2.toLowerCase().split(/\s+/))
      
      const intersection = new Set([...words1].filter(x => words2.has(x)))
      const union = new Set([...words1, ...words2])
      
      return intersection.size / union.size
    }
  },

  /**
   * Reranking using cross-encoder models
   */
  rerank: {
    name: 'Reranking',
    description: 'Reranks results using cross-encoder models',
    async execute(results, context, options = {}) {
      const { topK = 50, keep = 24, model = 'default' } = options
      
      if (results.length === 0) {
        return results
      }
      
      // Take top K results for reranking
      const topResults = results.slice(0, topK)
      
      // Simplified reranking - in real implementation would use actual cross-encoder
      const reranked = this._rerankResults(topResults, context.query, model)
      
      return reranked.slice(0, keep)
    },

    _rerankResults(results, query, model) {
      // Simplified reranking based on text similarity to query
      return results.map(result => {
        const relevanceScore = this._calculateRelevance(result.text, query)
        return {
          ...result,
          rerankScore: relevanceScore,
          finalScore: (result.score + relevanceScore) / 2
        }
      }).sort((a, b) => b.finalScore - a.finalScore)
    },

    _calculateRelevance(text, query) {
      // Simplified relevance calculation
      const queryWords = query.toLowerCase().split(/\s+/)
      const textWords = text.toLowerCase().split(/\s+/)
      
      let matches = 0
      queryWords.forEach(word => {
        if (textWords.includes(word)) {
          matches++
        }
      })
      
      return matches / queryWords.length
    }
  },

  /**
   * Maximum Marginal Relevance for diversity
   */
  mmr: {
    name: 'Maximum Marginal Relevance',
    description: 'Balances relevance and diversity in results',
    async execute(results, context, options = {}) {
      const { diversity = 0.7 } = options
      
      if (results.length === 0) {
        return results
      }
      
      const mmrResults = []
      const remaining = [...results]
      
      // Select first result (highest relevance)
      if (remaining.length > 0) {
        mmrResults.push(remaining.shift())
      }
      
      // Select remaining results using MMR
      while (remaining.length > 0 && mmrResults.length < context.limit) {
        let bestIdx = 0
        let bestScore = -Infinity
        
        remaining.forEach((candidate, idx) => {
          const relevance = candidate.score
          const maxSimilarity = Math.max(...mmrResults.map(selected => 
            this._calculateSimilarity(candidate.text, selected.text)
          ))
          const mmrScore = diversity * relevance - (1 - diversity) * maxSimilarity
          
          if (mmrScore > bestScore) {
            bestScore = mmrScore
            bestIdx = idx
          }
        })
        
        mmrResults.push(remaining.splice(bestIdx, 1)[0])
      }
      
      return mmrResults
    },

    _calculateSimilarity(text1, text2) {
      // Simplified similarity calculation
      const words1 = new Set(text1.toLowerCase().split(/\s+/))
      const words2 = new Set(text2.toLowerCase().split(/\s+/))
      
      const intersection = new Set([...words1].filter(x => words2.has(x)))
      const union = new Set([...words1, ...words2])
      
      return intersection.size / union.size
    }
  },

  /**
   * Join parent chunks for context
   */
  joinParent: {
    name: 'Join Parent',
    description: 'Joins parent chunks for additional context',
    async execute(results, context, options = {}) {
      const { depth = 1, pullFull = false } = options
      
      if (results.length === 0) {
        return results
      }
      
      const enrichedResults = []
      
      for (const result of results) {
        const enriched = { ...result }
        
        if (result.meta?.parent_id) {
          // In real implementation, would fetch parent chunks from database
          enriched.parentContext = this._getParentContext(result.meta.parent_id, depth)
        }
        
        enrichedResults.push(enriched)
      }
      
      return enrichedResults
    },

    _getParentContext(parentId, depth) {
      // Simplified parent context retrieval
      return `Parent context for chunk ${parentId} (depth: ${depth})`
    }
  },

  /**
   * Budget control for result size
   */
  budget: {
    name: 'Budget Control',
    description: 'Controls result size based on character budget',
    async execute(results, context, options = {}) {
      const { maxChars = 7000, window = 'normal' } = options
      
      if (results.length === 0) {
        return results
      }
      
      const budgetedResults = []
      let totalChars = 0
      
      for (const result of results) {
        const resultChars = result.text?.length || 0
        
        if (totalChars + resultChars <= maxChars) {
          budgetedResults.push(result)
          totalChars += resultChars
        } else {
          break
        }
      }
      
      return budgetedResults
    }
  },

  /**
   * Code expansion for technical content
   */
  codeExpand: {
    name: 'Code Expansion',
    description: 'Expands queries with code-related terms',
    async execute(results, context, options = {}) {
      const { expandSymbols = true, expandFunctions = true } = options
      
      if (!expandSymbols && !expandFunctions) {
        return results
      }
      
      // In real implementation, would expand query with code symbols and functions
      const expandedQuery = this._expandCodeQuery(context.query, options)
      
      // Re-execute search with expanded query
      const queryVector = (await context.embedder.embedBatch([expandedQuery]))[0]
      const expandedResults = await Chunk.searchByVector(context.trx, {
        collectionId: context.collectionId,
        vector: queryVector,
        limit: context.limit,
        spaceId: context.space.id
      })
      
      return expandedResults.map((result, index) => ({
        ...result,
        score: 1 - index / expandedResults.length,
        source: 'code-expanded'
      }))
    },

    _expandCodeQuery(query, options) {
      let expanded = query
      
      if (options.expandSymbols) {
        expanded += ` symbols functions classes methods`
      }
      
      if (options.expandFunctions) {
        expanded += ` API endpoints parameters`
      }
      
      return expanded
    }
  },

  /**
   * Table assembly for tabular content
   */
  tableAssemble: {
    name: 'Table Assembly',
    description: 'Assembles table content with surrounding context',
    async execute(results, context, options = {}) {
      const { includeSurrounding = true } = options
      
      return results.map(result => {
        if (result.meta?.type === 'table' && includeSurrounding) {
          return {
            ...result,
            assembledContent: this._assembleTableContent(result)
          }
        }
        return result
      })
    },

    _assembleTableContent(result) {
      // Simplified table assembly
      return `Table content: ${result.text}\nSurrounding context: [Additional context would be added here]`
    }
  },

  /**
   * Thread joining for email/chat content
   */
  threadJoin: {
    name: 'Thread Join',
    description: 'Groups results by thread ID for email/chat content',
    async execute(results, context, options = {}) {
      const { groupBy = 'thread_id' } = options
      
      if (results.length === 0) {
        return results
      }
      
      const threadGroups = new Map()
      
      results.forEach(result => {
        const threadId = result.meta?.[groupBy] || 'no-thread'
        
        if (!threadGroups.has(threadId)) {
          threadGroups.set(threadId, [])
        }
        
        threadGroups.get(threadId).push(result)
      })
      
      // Return results grouped by thread
      const groupedResults = []
      threadGroups.forEach(threadResults => {
        groupedResults.push({
          threadId: threadResults[0].meta?.[groupBy],
          results: threadResults,
          threadScore: Math.max(...threadResults.map(r => r.score))
        })
      })
      
      return groupedResults.sort((a, b) => b.threadScore - a.threadScore)
    }
  },

  /**
   * Recency boosting for time-sensitive content
   */
  recency: {
    name: 'Recency Boost',
    description: 'Boosts results based on recency',
    async execute(results, context, options = {}) {
      const { timeDecay = 0.1, timeField = 'created_at' } = options
      
      const now = new Date()
      
      return results.map(result => {
        const timeValue = result.meta?.[timeField] || result[timeField]
        if (!timeValue) {
          return result
        }
        
        const timeDiff = now - new Date(timeValue)
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
        const recencyBoost = Math.exp(-timeDecay * daysDiff)
        
        return {
          ...result,
          score: result.score * recencyBoost,
          recencyBoost
        }
      }).sort((a, b) => b.score - a.score)
    }
  }
}

/**
 * Get a tool by name
 * @param {string} toolName - Name of the tool
 * @returns {Object|null} Tool implementation or null if not found
 */
function getTool(toolName) {
  return tools[toolName] || null
}

/**
 * Get all available tools
 * @returns {Array} Array of tool information
 */
function getAvailableTools() {
  return Object.entries(tools).map(([key, tool]) => ({
    key,
    name: tool.name,
    description: tool.description
  }))
}

/**
 * Get detailed information about a tool
 * @param {string} toolName - Name of the tool
 * @returns {Object} Tool details
 */
function getToolDetails(toolName) {
  const tool = tools[toolName]
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  
  return {
    name: tool.name,
    description: tool.description
  }
}

module.exports = {
  tools,
  getTool,
  getAvailableTools,
  getToolDetails
}
