/**
 * Attachment tools for adding metadata and relationships to chunks
 */

/**
 * Helper function to calculate position metadata for chunks
 * @param {string} text - Full document text
 * @param {number} startPos - Start position in text
 * @param {number} endPos - End position in text
 * @returns {Object} Position metadata object
 */
function calculatePositionMetadata(text, startPos, endPos) {
  // Calculate line number
  const textBeforeChunk = text.slice(0, startPos)
  const lineNumber = (textBeforeChunk.match(/\n/g) || []).length + 1
  
  return {
    start_pos: startPos,
    end_pos: endPos,
    line_number: lineNumber
  }
}

/**
 * Add section references to chunks based on surrounding context
 * @param {Array} chunks - Array of chunk objects with position data
 * @param {string} fullText - Full document text for context extraction
 * @returns {Array} Chunks with section references
 */
function addAnchors(chunks, fullText) {
  if (!Array.isArray(chunks) || !fullText) {
    return chunks || []
  }

  return chunks.map((chunk) => {
    // Use position data from strategy
    const startPos = (chunk.meta && chunk.meta.start_pos) || 0
    const endPos = (chunk.meta && chunk.meta.end_pos) || startPos + chunk.text.length
    
    // Extract section references from surrounding context
    const contextBefore = fullText.slice(Math.max(0, startPos - 200), startPos)
    const contextAfter = fullText.slice(endPos, Math.min(fullText.length, endPos + 200))
    
    const sectionRefs = extractSectionReferences(contextBefore + contextAfter)
    
    return {
      ...chunk,
      meta: {
        ...chunk.meta,
        section_references: sectionRefs
      }
    }
  })
}

/**
 * Extract section references from text context
 * @param {string} context - Text context to analyze
 * @returns {Array} Array of section references
 */
function extractSectionReferences(context) {
  const references = []
  
  // Look for heading patterns
  const headingPattern = /^(#{1,6}\s+.+)$/gm
  const headings = [...context.matchAll(headingPattern)]
  
  for (const heading of headings) {
    const level = (heading[0].match(/^#+/) || [''])[0].length
    const text = heading[0].replace(/^#+\s*/, '').trim()
    references.push({ type: 'heading', level, text })
  }
  
  // Look for numbered sections
  const sectionPattern = /(?:Section|Chapter|Part)\s+(\d+(?:\.\d+)*)/gi
  const sections = [...context.matchAll(sectionPattern)]
  
  for (const section of sections) {
    references.push({ type: 'section', number: section[1] })
  }
  
  return references
}

/**
 * Add parent-child relationships between chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Object} options - Options
 * @param {string} options.parentType - Type of parent relationship (default: 'document')
 * @param {string} options.childType - Type of child relationship (default: 'chunk')
 * @param {string} options.documentId - Document ID to use as parent (required)
 * @returns {Array} Chunks with parent-child relationships
 */
function addParentChild(chunks, { parentType = 'document', childType = 'chunk', documentId = null } = {}) {
  if (!Array.isArray(chunks)) {
    return []
  }

  // Use provided documentId or generate one if not provided
  const docId = documentId || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // Group chunks by section_path to build proper hierarchy
  const sectionMap = new Map()
  const rootChunks = []
  
  chunks.forEach((chunk, index) => {
    const sectionPath = chunk.section_path || 'root'
    
    if (!sectionMap.has(sectionPath)) {
      sectionMap.set(sectionPath, [])
    }
    sectionMap.get(sectionPath).push({ ...chunk, originalIndex: index })
    
    if (!chunk.section_path) {
      rootChunks.push({ ...chunk, originalIndex: index })
    }
  })

  return chunks.map((chunk, index) => {
    const relationships = {
      parent: {
        type: parentType,
        id: docId, // Consistent document ID across all chunks
        level: 0
      },
      children: []
    }

    // Add section context and heading level
    if (chunk.section_path) {
      relationships.parent.section_path = chunk.section_path
      relationships.parent.level = getHeadingLevel(chunk.section_path)
    }

    // Find all chunks in the same section as children (siblings)
    if (chunk.section_path) {
      const sectionChunks = sectionMap.get(chunk.section_path) || []
      sectionChunks.forEach(sectionChunk => {
        if (sectionChunk.originalIndex !== index) {
          relationships.children.push({
            type: childType,
            id: `chunk_${sectionChunk.originalIndex}`,
            chunk_index: sectionChunk.chunk_index,
            relationship_type: 'sibling'
          })
        }
      })
    } else {
      // For root chunks, find other root chunks as siblings
      rootChunks.forEach(rootChunk => {
        if (rootChunk.originalIndex !== index) {
          relationships.children.push({
            type: childType,
            id: `chunk_${rootChunk.originalIndex}`,
            chunk_index: rootChunk.chunk_index,
            relationship_type: 'sibling'
          })
        }
      })
    }

    return {
      ...chunk,
      meta: {
        ...chunk.meta,
        relationships
      }
    }
  })
}

/**
 * Extract heading level from markdown-style headings
 * @param {string} heading - Heading text
 * @returns {number} Heading level (0 for non-headings)
 */
function getHeadingLevel(heading) {
  if (!heading) return 0
  
  // Extract heading level from markdown-style headings (# ## ###)
  const match = heading.match(/^(#+)/)
  return match ? match[1].length : 0
}

/**
 * Add file path metadata to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {string} filePath - File path to add
 * @returns {Array} Chunks with file path metadata
 */
function addFilePath(chunks, filePath) {
  if (!Array.isArray(chunks) || !filePath) {
    return chunks || []
  }

  return chunks.map(chunk => ({
    ...chunk,
    meta: {
      ...chunk.meta,
      file_path: filePath
    }
  }))
}

/**
 * Add symbol information for code chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {string} fullText - Full document text for symbol extraction
 * @returns {Array} Chunks with symbol information
 */
function addSymbols(chunks, fullText) {
  if (!Array.isArray(chunks) || !fullText) {
    return chunks || []
  }

  return chunks.map(chunk => {
    if (chunk.meta && chunk.meta.type !== 'code') {
      return chunk
    }

    const symbols = extractSymbols(chunk.text)
    
    return {
      ...chunk,
      meta: {
        ...chunk.meta,
        symbols
      }
    }
  })
}

/**
 * Extract symbols from code text
 * @param {string} codeText - Code text to analyze
 * @returns {Array} Array of symbol information
 */
function extractSymbols(codeText) {
  const symbols = []
  
  // Function definitions
  const functionPattern = /(?:function|def|fn|const|let|var)\s+(\w+)\s*[=\(]/g
  const functions = [...codeText.matchAll(functionPattern)]
  for (const func of functions) {
    symbols.push({ type: 'function', name: func[1] })
  }
  
  // Class definitions
  const classPattern = /(?:class|interface|type)\s+(\w+)/g
  const classes = [...codeText.matchAll(classPattern)]
  for (const cls of classes) {
    symbols.push({ type: 'class', name: cls[1] })
  }
  
  // Variable declarations
  const variablePattern = /(?:const|let|var)\s+(\w+)/g
  const variables = [...codeText.matchAll(variablePattern)]
  for (const variable of variables) {
    symbols.push({ type: 'variable', name: variable[1] })
  }
  
  return symbols
}

/**
 * Add email metadata to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Object} emailMeta - Email metadata
 * @returns {Array} Chunks with email metadata
 */
function addEmailMetadata(chunks, emailMeta = {}) {
  if (!Array.isArray(chunks)) {
    return []
  }

  return chunks.map(chunk => ({
    ...chunk,
    meta: {
      ...chunk.meta,
      email: {
        sender: emailMeta.sender || null,
        recipient: emailMeta.recipient || null,
        subject: emailMeta.subject || null,
        timestamp: emailMeta.timestamp || null,
        thread_id: emailMeta.thread_id || null,
        message_id: emailMeta.message_id || null
      }
    }
  }))
}

/**
 * Add table metadata to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Object} tableMeta - Table metadata
 * @returns {Array} Chunks with table metadata
 */
function addTableMetadata(chunks, tableMeta = {}) {
  if (!Array.isArray(chunks)) {
    return []
  }

  return chunks.map(chunk => {
    if (chunk.meta && chunk.meta.type !== 'table') {
      return chunk
    }

    return {
      ...chunk,
      meta: {
        ...chunk.meta,
        table: {
          rows: tableMeta.rows || 0,
          columns: tableMeta.columns || 0,
          headers: tableMeta.headers || [],
          csv_data: tableMeta.csv_data || null,
          json_data: tableMeta.json_data || null
        }
      }
    }
  })
}

/**
 * Add slide/page metadata to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Object} slideMeta - Slide metadata
 * @returns {Array} Chunks with slide metadata
 */
function addSlideMetadata(chunks, slideMeta = {}) {
  if (!Array.isArray(chunks)) {
    return []
  }

  return chunks.map(chunk => ({
    ...chunk,
    meta: {
      ...chunk.meta,
      slide: {
        slide_number: slideMeta.slide_number || chunk.page_no || null,
        total_slides: slideMeta.total_slides || null,
        deck_title: slideMeta.deck_title || null,
        section: slideMeta.section || null
      }
    }
  }))
}

/**
 * Add language detection metadata to chunks
 * @param {Array} chunks - Array of chunk objects
 * @param {Function} languageDetector - Language detection function
 * @returns {Array} Chunks with language metadata
 */
function addLanguageMetadata(chunks, languageDetector) {
  if (!Array.isArray(chunks) || typeof languageDetector !== 'function') {
    return chunks || []
  }

  return chunks.map(chunk => {
    const detectedLanguage = languageDetector(chunk.text)
    
    return {
      ...chunk,
      meta: {
        ...chunk.meta,
        language: {
          detected: detectedLanguage,
          confidence: 0.8 // Placeholder confidence score
        }
      }
    }
  })
}

module.exports = {
  addAnchors,
  addParentChild,
  addFilePath,
  addSymbols,
  addEmailMetadata,
  addTableMetadata,
  addSlideMetadata,
  addLanguageMetadata,
  extractSectionReferences,
  extractSymbols,
  calculatePositionMetadata,
  getHeadingLevel
}
