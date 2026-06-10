const { fileStorage, useTransaction } = require('@coko/server')
const pubsub = require('@coko/server/src/graphql/pubsub')
const mime = require('mime-types')
const fs = require('node:fs')
const path = require('node:path')
const { v4: uuidv4 } = require('uuid')
const fetch = require('node-fetch')
const { DocumentIngestionService } = require('../../services/embeddings')
const Document = require('../../models/document/document.model')
const Collection = require('../../models/collection/collection.model')
const { uploadHandler } = require('./helpers')

/**
 * Extract text content from various sources (file buffer, URL, or content)
 * @param {Object} source - Source object containing either buffer, url, or content
 * @param {Buffer} [source.buffer] - File buffer (for file uploads)
 * @param {string} [source.url] - URL to fetch content from
 * @param {string} [source.content] - Raw text content
 * @param {string} [source.mimeType] - MIME type (for file uploads)
 * @param {string} [source.originalName] - Original filename (for file uploads)
 * @returns {Promise<Object>} Object containing extracted text and metadata
 */
async function extractTextFromSource(source) {
  const { buffer, url, content, mimeType: providedMimeType, originalName: providedOriginalName } = source

  if (buffer) {
    // Handle file buffer
    const text = buffer.toString('utf8')
    const mimeType = providedMimeType || 'text/plain'
    const originalName = providedOriginalName || 'uploaded-file.txt'
    
    // For now, we'll handle basic text files
    // In the future, you can add support for PDF, DOCX, etc.
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || 
        originalName.endsWith('.txt') || originalName.endsWith('.md')) {
      return { text, mimeType, originalName, contentLength: text.length }
    }
    
    // For other file types, try to extract as text
    // This is a basic implementation - you might want to add proper parsers
    if (mimeType.startsWith('text/')) {
      return { text, mimeType, originalName, contentLength: text.length }
    }
    
    // For binary files, we'll need to implement proper parsers
    // For now, throw an error for unsupported types
    throw new Error(`Unsupported file type: ${mimeType}. Currently only text files are supported.`)
  }

  if (url) {
    // Handle URL
    try {
      // Validate URL format
      const urlPattern = /^https?:\/\/.+/i
      if (!urlPattern.test(url)) {
        throw new Error('Invalid URL format. URL must start with http:// or https://')
      }

      // Fetch content from URL
      const response = await fetch(url, {
        timeout: 30000, // 30 second timeout
        redirect: 'follow',
        headers: {
          'User-Agent': 'RAGService/1.0 (Text Extraction Bot)'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type') || 'text/plain'
      const mimeType = contentType.split(';')[0].trim()
      const text = await response.text()

      // Validate that we got text content
      if (typeof text !== 'string') {
        throw new Error(`Expected text content but received ${typeof text}. Content-Type: ${mimeType}`)
      }

      if (!text || text.trim().length === 0) {
        throw new Error('No text content found at the provided URL')
      }

      // Extract filename from URL or use a default
      const urlPath = new URL(url).pathname
      const originalName = path.basename(urlPath) || 'webpage.txt'

      return { text, mimeType, originalName, contentLength: text.length }

    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error(`Unable to connect to URL: ${error.message}`)
      }
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - URL took too long to respond')
      }
      if (error.message.includes('HTTP')) {
        throw error // Re-throw HTTP errors as they're already formatted
      }
      throw new Error(`Failed to fetch content from URL: ${error.message}`)
    }
  }

  if (content) {
    // Handle raw text content
    if (typeof content !== 'string') {
      throw new Error('Content must be a string')
    }

    if (!content || content.trim().length === 0) {
      throw new Error('Content cannot be empty')
    }

    const mimeType = providedMimeType || 'text/plain'
    const originalName = providedOriginalName || 'content.txt'

    return { 
      text: content, 
      mimeType, 
      originalName, 
      contentLength: content.length 
    }
  }

  throw new Error('Either buffer, url, or content must be provided in the source object')
}

/**
 * Process embeddings asynchronously in the background
 * @param {Object} params - Parameters for embedding processing
 * @param {string} params.jobId - Job ID for tracking this specific processing job
 */
const processEmbeddingsAsync = async params => {
  try {
    // Create document record immediately (without embeddings)
    await Document.query().insert({
      id: params.documentId,
      collectionId: params.collectionId,
      sourceUri: params.sourceUri,
      mime: params.mime,
      language: params.language || null,
      meta: params.meta,
      status: 'QUEUED',
      processingStartedAt: new Date().toISOString(),
      processingCompletedAt: null,
      processingFailedAt: null,
      error: null,
      chunksInserted: 0,
      embeddingsInserted: 0
    })

    // Process embeddings using transaction
    const result = await useTransaction(async (trx) => {
      const ingestionService = new DocumentIngestionService()
      return await ingestionService.ingestDocument(trx, {
        documentId: params.documentId,
        collectionId: params.collectionId,
        source: {
          uri: params.sourceUri,
          mime: params.mime,
          language: params.language,
          meta: params.meta
        },
        rawText: params.rawText,
        chunkingOptions: params.chunkingOptions,
        batchSize: params.batchSize
      })
    })

    // Update document status to COMPLETED with results
    await Document.query().findById(params.documentId).patch({
      status: 'COMPLETED',
      processingCompletedAt: new Date().toISOString(),
      chunksInserted: result.chunksInserted,
      embeddingsInserted: result.embeddingsInserted
    })

    // Publish notification that embeddings are ready

    await pubsub.publish(`DOCUMENT_PROCESSING_UPDATE_${params.jobId}`, {
      documentProcessingUpdate: {
        documentId: params.documentId,
        collectionId: params.collectionId,
        jobId: params.jobId,
        status: 'COMPLETED',
        chunksInserted: result.chunksInserted,
        embeddingsInserted: result.embeddingsInserted,
        error: null,
        processingCompletedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    // Update document status to FAILED
    await Document.query().findById(params.documentId).patch({
      status: 'FAILED',
      processingFailedAt: new Date().toISOString(),
      error: error.message
    })

    // Publish notification that processing failed
    try {
      await pubsub.publish(`DOCUMENT_PROCESSING_UPDATE_${params.jobId}`, {
        documentProcessingUpdate: {
          documentId: params.documentId,
          collectionId: params.collectionId,
          jobId: params.jobId,
          status: 'FAILED',
          chunksInserted: 0,
          embeddingsInserted: 0,
          error: error.message,
          processingCompletedAt: null
        }
      })
      console.log(`Published failure notification for job ${params.jobId}`)
    } catch (pubsubError) {
      console.error(`Failed to publish failure notification for job ${params.jobId}:`, pubsubError)
    }
    
    throw error
  }
}

const RESTEndpoints = app => {
  const { authenticate } = require('@coko/service-auth')
  
  // Primary ingest endpoint - automatically handles both file uploads and URL ingestion
  // Supports multipart/form-data for file uploads and application/json for URL ingestion
  app.post('/api/ingest', authenticate, uploadHandler, async (req, res) => {
    try {
      // Extract form fields and file
      const { 
        userId, 
        collectionId, 
        url,
        content,
        mime: mimeType, 
        language, 
        meta,
        chunkingStrategy = 'generalist',
        maxTokens = 200,  // Default: 200 tokens ≈ 800 characters
        overlapTokens,
        tokenModel,
        batchSize = 64
      } = req.body

      console.log('req.body', req.body)

      const file = req.file

      // Validate required fields - userId is required
      if (!userId) {
        return res.status(400).json({
          error: 'Missing required field: userId is required'
        })
      }
  
      if (!file && !url && !content) {
        return res.status(400).json({
          error: 'No content source provided: either upload a file (multipart/form-data) or provide a URL (application/json)'
        })
      }

      let colId = collectionId

      if (!collectionId) {
        col = await Collection.insertDefaultCollection({ userId })
        colId = col.id
      }

      // Prepare source object for text extraction
      let source
      if (file) {
        const fileBuffer = fs.readFileSync(file.path)
        console.log('Read file from disk, buffer length:', fileBuffer.length)
        source = {
          buffer: fileBuffer,
          mimeType: mimeType || file.mimetype,
          originalName: file.originalname
        }
      } else if (url) {
        source = { url }
      } else if (content) {
        source = { content }
      }

      // Extract text content from the source
      const extractedData = await extractTextFromSource(source)
      const { text: rawText, mimeType: extractedMimeType, originalName, contentLength } = extractedData

      if (!rawText || rawText.trim().length === 0) {
        return res.status(400).json({
          error: 'No text content could be extracted from the provided source (file or URL)'
        })
      }

      // Generate document ID and job ID
      const documentId = uuidv4()
      const jobId = uuidv4()

      // Determine file extension from mime type or original filename
      let fileExtension = '.txt'
      if (extractedMimeType) {
        const ext = mime.extension(extractedMimeType)
        if (ext) fileExtension = `.${ext}`
      } else if (originalName && path.extname(originalName)) {
        fileExtension = path.extname(originalName)
      }

      // Generate S3 key
      const fileName = `${documentId}${fileExtension}`
      const s3Key = `kb/${colId}/${fileName}`
      const sourceUri = `s3://bucket/${s3Key}`

      // Upload content to S3 using fileStorage
      await fileStorage.upload(s3Key, originalName, {
        contentType: extractedMimeType || 'text/plain'
      })

      console.log('Processing embeddings asynchronously in the background', chunkingStrategy)
      // Process embeddings asynchronously in the background
      processEmbeddingsAsync({
        documentId,
        collectionId: colId,
        jobId,
        sourceUri,
        mime: extractedMimeType,
        language: language || null,
        meta: meta ? meta : null,
        rawText,
        chunkingOptions: {
          strategy: chunkingStrategy,
          ...(maxTokens && { maxTokens: parseInt(maxTokens) }),
          ...(overlapTokens && { overlapTokens: parseInt(overlapTokens) }),
          ...(tokenModel && { model: tokenModel })
        },
        batchSize: parseInt(batchSize)
      }).catch(error => {
        console.error(`Failed to process embeddings for document ${documentId}:`, error)
        // Update document status to failed
        Document.query().findById(documentId).patch({ status: 'FAILED', error: error.message })
      })

      // Prepare response data
      const responseData = {
        documentId,
        jobId,
        sourceUri,
        status: 'QUEUED',
        textLength: contentLength,
        mimeType: extractedMimeType,
        originalName: originalName
      }

      // Add source-specific information to response
      if (file) {
        responseData.sourceType = 'file'
        responseData.fileName = file.originalname
      } else if (url) {
        responseData.sourceType = 'url'
        responseData.url = url
      } else if (content) {
        responseData.sourceType = 'content'
        responseData.contentLength = content.length
      }

      // Return success response immediately with QUEUED status
      res.status(200).json(responseData)

    } catch (err) {
      console.error('Error processing ingest:', err)
      
      // Return appropriate error response based on error type
      if (err.message.includes('Unsupported file type')) {
        return res.status(400).json({
          error: 'Unsupported file type',
          message: err.message
        })
      }
      
      if (err.message.includes('Invalid URL format') || err.message.includes('Unable to connect to URL')) {
        return res.status(400).json({
          error: 'Invalid URL or connection error',
          message: err.message
        })
      }
      
      if (err.message.includes('HTTP 4') || err.message.includes('HTTP 5')) {
        return res.status(400).json({
          error: 'URL access error',
          message: err.message
        })
      }
      
      if (err.message.includes('No text content found') || err.message.includes('No text content could be extracted')) {
        return res.status(400).json({
          error: 'No text content found',
          message: err.message
        })
      }
      
      if (err.message.includes('Collection not found') || err.message.includes('Embedding space not found')) {
        return res.status(404).json({
          error: 'Collection or embedding space not found',
          message: err.message
        })
      }
      
      if (err.message.includes('No embedding client registered')) {
        return res.status(500).json({
          error: 'Embedding service configuration error',
          message: err.message
        })
      }
      
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      })
    }
  })

}

module.exports = RESTEndpoints