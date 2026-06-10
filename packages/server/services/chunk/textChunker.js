/**
 * Utility functions for chunking text documents
 */

const { encoding_for_model } = require('tiktoken');

/**
 * Find the best boundary position within a text slice, respecting word boundaries
 * @param {string} text - The full text
 * @param {number} start - Start position
 * @param {number} end - End position
 * @param {number} minSize - Minimum acceptable chunk size
 * @returns {number} Best boundary position
 */
function findBestBoundary(text, start, end, minSize) {
  const slice = text.slice(start, end)
  
  // Boundary hierarchy: paragraph → sentence → word → character
  const boundaries = [
    { pattern: /\n\s*\n/g, name: 'paragraph' },
    { pattern: /[.!?]+\s+/g, name: 'sentence' },
    { pattern: /\s+/g, name: 'word' }
  ]
  
  for (const boundary of boundaries) {
    const matches = [...slice.matchAll(boundary.pattern)]
    
    // Look for boundaries in the last 30% of the slice
    const searchStart = Math.max(0, slice.length - Math.floor(slice.length * 0.3))
    
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i]
      const boundaryPos = start + match.index + match[0].length
      
      // Check if this boundary position gives us a reasonable chunk size
      if (boundaryPos - start >= minSize) {
        return boundaryPos
      }
    }
  }
  
  // Fallback: if no good boundary found, return the original end
  return end
}

/**
 * Create overlapping chunks from text with proper word boundary detection
 * @param {string} text - The text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.size - Maximum chunk size in characters (default: 800)
 * @param {number} options.overlap - Overlap size in characters (default: 120)
 * @param {number} options.minSize - Minimum chunk size to accept (default: 200)
 * @param {number} options.maxTokens - Maximum tokens per chunk (optional, enables token-aware mode)
 * @param {number} options.overlapTokens - Overlap in tokens (optional, used when maxTokens is provided)
 * @param {string} options.model - Model name for tokenization (should match embedding model)
 * @returns {Array} Array of chunk objects
 */
function simpleOverlapChunks(text, { size = 800, overlap = 120, minSize = 200, maxTokens, overlapTokens, model = 'text-embedding-ada-002' } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // If maxTokens is provided, use token-aware chunking
  if (maxTokens) {
    return tokenAwareChunks(text, { 
      maxTokens, 
      minTokens: Math.floor(maxTokens / 4), 
      overlapTokens: overlapTokens || Math.floor(maxTokens / 10),
      model
    })
  }

  // Safety checks for character-based chunking
  if (overlap >= size) {
    console.warn(`Overlap (${overlap}) is greater than or equal to size (${size}). Setting overlap to size - 1 to prevent infinite loop.`)
    overlap = Math.max(0, size - 1)
  }
  
  if (minSize >= size) {
    console.warn(`MinSize (${minSize}) is greater than or equal to size (${size}). Setting minSize to size / 2.`)
    minSize = Math.floor(size / 2)
  }

  const parts = []
  let i = 0
  let idx = 0

  while (i < text.length) {
    const end = Math.min(text.length, i + size)
    let actualEnd = end

    // Find the best boundary if we're not at the end of text
    if (end < text.length) {
      actualEnd = findBestBoundary(text, i, end, minSize)
      
      // If no good boundary found, we might need to extend the chunk
      if (actualEnd === end && actualEnd - i < minSize) {
        // Try to extend to find a better boundary
        const extendedEnd = Math.min(text.length, i + size + (size - minSize))
        actualEnd = findBestBoundary(text, i, extendedEnd, minSize)
      }
    }

    const slice = text.slice(i, actualEnd)

    // Only add non-empty chunks
    if (slice.trim().length > 0) {
      parts.push({
        chunk_index: idx,
        text: slice,
        overlap_before: i === 0 ? 0 : overlap,
        overlap_after: actualEnd < text.length ? overlap : 0,
        section_path: null,
        page_no: null,
        meta: null
      })
      idx++
    }

    // Move forward, accounting for overlap
    // Ensure we always move forward to prevent infinite loops
    const nextStart = Math.max(i + 1, actualEnd - overlap)
    i = nextStart
  }

  console.log('chunking completed. Generated', parts.length, 'chunks')
  return parts
}

/**
 * Get tiktoken encoder for a specific model
 * @param {string} model - Model name (default: 'text-embedding-ada-002')
 * @returns {Object} Tiktoken encoder
 */
function getTokenizer(model = 'text-embedding-ada-002') {
  try {
    return encoding_for_model(model);
  } catch (error) {
    // Fallback to cl100k_base encoding if model not found
    console.warn(`Model ${model} not found, falling back to cl100k_base encoding`);
    return encoding_for_model('cl100k_base');
  }
}

/**
 * Get accurate token count using tiktoken
 * @param {string} text - Text to tokenize
 * @param {string} model - Model name (default: 'text-embedding-ada-002')
 * @returns {number} Accurate token count
 */
function getTokenCount(text, model = 'text-embedding-ada-002') {
  const encoding = getTokenizer(model);
  return encoding.encode(text).length;
}

/**
 * Split text into tokens using tiktoken
 * @param {string} text - Text to tokenize
 * @param {string} model - Model name (default: 'text-embedding-ada-002')
 * @returns {Array} Array of token strings
 */
function tokenizeText(text, model = 'text-embedding-ada-002') {
  const encoding = getTokenizer(model);
  const tokens = encoding.encode(text);
  return tokens.map(token => {
    const tokenBytes = encoding.decode([token]);
    return new TextDecoder().decode(tokenBytes);
  });
}

/**
 * Get token boundaries for text using tiktoken
 * @param {string} text - Text to analyze
 * @param {string} model - Model name (default: 'text-embedding-ada-002')
 * @returns {Array} Array of objects with token text and boundaries
 */
function getTokenBoundaries(text, model = 'text-embedding-ada-002') {
  const encoding = getTokenizer(model);
  const tokens = encoding.encode(text);
  
  let currentPos = 0;
  const boundaries = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const tokenId = tokens[i];
    const tokenBytes = encoding.decode([tokenId]);
    const tokenText = new TextDecoder().decode(tokenBytes);
    const start = currentPos;
    const end = currentPos + tokenText.length;
    
    boundaries.push({
      index: i,
      text: tokenText,
      start,
      end,
      tokenId
    });
    
    currentPos = end;
  }
  
  return boundaries;
}

/**
 * Create token-aware chunks that respect word boundaries using tiktoken
 * @param {string} text - The text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.maxTokens - Maximum tokens per chunk (default: 200, ≈800 characters)
 * @param {number} options.minTokens - Minimum tokens per chunk (default: 50)
 * @param {number} options.overlapTokens - Overlap in tokens (default: 20)
 * @param {string} options.model - Model name for tokenization (should match embedding model)
 * @returns {Array} Array of chunk objects
 */
function tokenAwareChunks(text, { maxTokens = 200, minTokens = 50, overlapTokens = 20, model = 'text-embedding-ada-002' } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Safety checks
  if (overlapTokens >= maxTokens) {
    console.warn(`Overlap tokens (${overlapTokens}) is greater than or equal to max tokens (${maxTokens}). Setting overlap to max/4.`)
    overlapTokens = Math.max(1, Math.floor(maxTokens / 4))
  }
  
  if (minTokens >= maxTokens) {
    console.warn(`Min tokens (${minTokens}) is greater than or equal to max tokens (${maxTokens}). Setting min to max/2.`)
    minTokens = Math.floor(maxTokens / 2)
  }

  const tokenBoundaries = getTokenBoundaries(text, model);
  const chunks = []
  let i = 0
  let idx = 0

  while (i < tokenBoundaries.length) {
    // Find the end position for this chunk
    let end = i
    let tokenCount = 0
    
    // Build chunk token by token until we reach maxTokens
    while (end < tokenBoundaries.length && tokenCount < maxTokens) {
      tokenCount++
      end++
    }

    // If we didn't find enough content, try to extend
    if (tokenCount < minTokens && end < tokenBoundaries.length) {
      const remainingTokens = tokenBoundaries.length - end
      
      if (tokenCount + remainingTokens <= maxTokens * 1.5) {
        // Take the rest if it's not too much larger
        end = tokenBoundaries.length
        tokenCount += remainingTokens
      }
    }

    // Convert tokens back to text using boundaries
    const startPos = tokenBoundaries[i].start;
    const endPos = end < tokenBoundaries.length ? tokenBoundaries[end].start : text.length;
    const slice = text.slice(startPos, endPos).trim()
    
    if (slice.length > 0) {
      chunks.push({
        chunk_index: idx,
        text: slice,
        overlap_before: i === 0 ? 0 : overlapTokens,
        overlap_after: end < tokenBoundaries.length ? overlapTokens : 0,
        section_path: null,
        page_no: null,
        meta: { 
          token_count: tokenCount,
          model: model
        }
      })
      idx++
    }

    // Move forward with overlap
    if (end >= tokenBoundaries.length) break
    
    // Calculate overlap start position - ensure we always move forward
    const overlapStart = Math.max(i + 1, end - overlapTokens)
    i = overlapStart
  }

  console.log('token-aware chunking completed. Generated', chunks.length, 'chunks')
  return chunks
}

/**
 * Create chunks based on semantic boundaries (paragraphs, sentences) with word boundary respect
 * @param {string} text - The text to chunk
 * @param {Object} options - Chunking options
 * @param {number} options.maxSize - Maximum chunk size in characters
 * @param {number} options.minSize - Minimum chunk size in characters
 * @param {number} options.overlap - Overlap size in characters
 * @returns {Array} Array of chunk objects
 */
function semanticChunks(text, { maxSize = 1000, minSize = 200, overlap = 150 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/)
  const chunks = []
  let currentChunk = ''
  let chunkIndex = 0

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim()
    if (!paragraph) continue

    // If adding this paragraph would exceed maxSize, finalize current chunk
    if (currentChunk && (currentChunk.length + paragraph.length > maxSize)) {
      chunks.push({
        chunk_index: chunkIndex++,
        text: currentChunk.trim(),
        overlap_before: 0,
        overlap_after: overlap,
        section_path: null,
        page_no: null,
        meta: null
      })
      
      // Start new chunk with overlap - respect word boundaries
      const overlapText = currentChunk.slice(-overlap)
      const lastWordBoundary = overlapText.lastIndexOf(' ')
      const cleanOverlap = lastWordBoundary > 0 ? overlapText.slice(lastWordBoundary + 1) : overlapText
      currentChunk = cleanOverlap + '\n\n' + paragraph
    } else {
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph
      } else {
        currentChunk = paragraph
      }
    }

    // If we have a chunk that meets minimum size, we can finalize it
    if (currentChunk.length >= minSize && i < paragraphs.length - 1) {
      chunks.push({
        chunk_index: chunkIndex++,
        text: currentChunk.trim(),
        overlap_before: 0,
        overlap_after: overlap,
        section_path: null,
        page_no: null,
        meta: null
      })
      
      // Start new chunk with overlap - respect word boundaries
      const overlapText = currentChunk.slice(-overlap)
      const lastWordBoundary = overlapText.lastIndexOf(' ')
      currentChunk = lastWordBoundary > 0 ? overlapText.slice(lastWordBoundary + 1) : overlapText
    }
  }

  // Add final chunk if there's remaining text
  if (currentChunk.trim()) {
    chunks.push({
      chunk_index: chunkIndex++,
      text: currentChunk.trim(),
      overlap_before: chunks.length > 0 ? overlap : 0,
      overlap_after: 0,
      section_path: null,
      page_no: null,
      meta: null
    })
  }

  return chunks
}

module.exports = {
  simpleOverlapChunks,
  semanticChunks,
  tokenAwareChunks,
  findBestBoundary,
  getTokenCount,
  tokenizeText,
  getTokenizer,
  getTokenBoundaries
}
