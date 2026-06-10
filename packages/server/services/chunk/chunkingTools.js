/**
 * Individual chunking tools and functions for different text processing strategies
 */

const { encoding_for_model } = require('tiktoken');

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
 * Get tiktoken encoder for a specific model
 * @param {string} model - Model name (default: 'text-embedding-ada-002')
 * @returns {Object} Tiktoken encoder
 */
function getTokenizer(model = 'text-embedding-ada-002') {
  try {
    return encoding_for_model(model);
  } catch (error) {
    console.warn(`Model ${model} not found, falling back to cl100k_base encoding`);
    return encoding_for_model('cl100k_base');
  }
}

/**
 * Get accurate token count using tiktoken
 * @param {string} text - Text to tokenize
 * @param {string} model - Model name
 * @returns {number} Accurate token count
 */
function getTokenCount(text, model = 'text-embedding-ada-002') {
  const encoding = getTokenizer(model);
  return encoding.encode(text).length;
}

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
 * Sentence window chunking - chunks text by sentences with configurable window size and overlap
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.windowSize - Number of sentences per chunk (default: 3)
 * @param {number} options.overlap - Number of sentences to overlap (default: 1)
 * @param {number} options.minSize - Minimum chunk size in characters (default: 200)
 * @returns {Array} Array of chunk objects
 */
function sentenceWindow(text, { windowSize = 3, overlap = 1, minSize = 200 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Split text into sentences
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  
  if (sentences.length === 0) {
    return []
  }

  const chunks = []
  let i = 0
  let chunkIndex = 0
  let currentPos = 0

  while (i < sentences.length) {
    const end = Math.min(i + windowSize, sentences.length)
    const chunkSentences = sentences.slice(i, end)
    const chunkText = chunkSentences.join(' ').trim()

    if (chunkText.length >= minSize) {
      // Calculate position in original text
      const startPos = currentPos
      const endPos = currentPos + chunkText.length
      
      // Calculate position metadata using helper function
      const positionMeta = calculatePositionMetadata(text, startPos, endPos)

      chunks.push({
        chunk_index: chunkIndex++,
        text: chunkText,
        overlap_before: i === 0 ? 0 : overlap,
        overlap_after: end < sentences.length ? overlap : 0,
        section_path: null,
        page_no: null,
        meta: {
          strategy: 'sentence_window',
          window_size: windowSize,
          sentence_count: chunkSentences.length,
          sentence_start: i,
          sentence_end: end - 1,
          ...positionMeta
        }
      })
      
      currentPos = endPos
    }

    // Move forward with overlap
    i = Math.max(i + 1, end - overlap)
  }

  return chunks
}

/**
 * Heading section chunking - chunks text by headings and sections
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size in characters (default: 200)
 * @param {number} options.maxSize - Maximum chunk size in characters (default: 2000)
 * @returns {Array} Array of chunk objects
 */
function headingSection(text, { minSize = 200, maxSize = 2000 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Split by markdown headings or common heading patterns
  const headingPattern = /^(#{1,6}\s+.+)$/gm
  const sections = text.split(headingPattern)
  
  const chunks = []
  let chunkIndex = 0
  let currentSection = ''
  let currentHeading = ''
  let currentPos = 0

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim()
    
    if (!section) continue

    // Check if this is a heading
    if (headingPattern.test(section)) {
      // If we have accumulated content, create a chunk
      if (currentSection.trim() && currentSection.length >= minSize) {
        const chunkText = currentSection.trim()
        const startPos = currentPos - currentSection.length
        const endPos = currentPos
        
        // Calculate position metadata using helper function
        const positionMeta = calculatePositionMetadata(text, startPos, endPos)

        chunks.push({
          chunk_index: chunkIndex++,
          text: chunkText,
          overlap_before: 0,
          overlap_after: 0,
          section_path: currentHeading,
          page_no: null,
          meta: {
            strategy: 'heading_section',
            heading: currentHeading,
            section_length: currentSection.length,
            ...positionMeta
          }
        })
      }
      
      currentHeading = section
      currentSection = section + '\n\n'
      currentPos += section.length + 2 // +2 for \n\n
    } else {
      currentSection += section + '\n\n'
      currentPos += section.length + 2 // +2 for \n\n
      
      // If section gets too large, split it
      if (currentSection.length > maxSize) {
        const splitPoint = findBestBoundary(currentSection, 0, maxSize, minSize)
        const chunkText = currentSection.slice(0, splitPoint).trim()
        
        if (chunkText.length >= minSize) {
          const startPos = currentPos - currentSection.length
          const endPos = startPos + chunkText.length
          
          // Calculate position metadata using helper function
          const positionMeta = calculatePositionMetadata(text, startPos, endPos)

          chunks.push({
            chunk_index: chunkIndex++,
            text: chunkText,
            overlap_before: 0,
            overlap_after: 0,
            section_path: currentHeading,
            page_no: null,
            meta: {
              strategy: 'heading_section',
              heading: currentHeading,
              section_length: chunkText.length,
              ...positionMeta
            }
          })
        }
        
        currentSection = currentSection.slice(splitPoint)
      }
    }
  }

  // Add final section
  if (currentSection.trim() && currentSection.length >= minSize) {
    const chunkText = currentSection.trim()
    const startPos = currentPos - currentSection.length
    const endPos = currentPos
    
    // Calculate position metadata using helper function
    const positionMeta = calculatePositionMetadata(text, startPos, endPos)

    chunks.push({
      chunk_index: chunkIndex++,
      text: chunkText,
      overlap_before: 0,
      overlap_after: 0,
      section_path: currentHeading,
      page_no: null,
      meta: {
        strategy: 'heading_section',
        heading: currentHeading,
        section_length: currentSection.length,
        ...positionMeta
      }
    })
  }

  return chunks
}

/**
 * Semantic breaks chunking - chunks text at natural topic shifts
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size in characters (default: 200)
 * @param {number} options.maxSize - Maximum chunk size in characters (default: 1500)
 * @returns {Array} Array of chunk objects
 */
function semanticBreaks(text, { minSize = 200, maxSize = 1500 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Look for semantic break patterns
  const breakPatterns = [
    /\n\s*\n\s*\n/g,  // Multiple paragraph breaks
    /(?:Chapter|Section|Part)\s+\d+/gi,  // Chapter/section markers
    /---+/g,  // Horizontal rules
    /\*\*\*+/g,  // Asterisk separators
    /={3,}/g,  // Equal sign separators
    /-{3,}/g   // Dash separators
  ]

  // Find all potential break points
  const breakPoints = [0] // Start of text
  
  for (const pattern of breakPatterns) {
    const matches = [...text.matchAll(pattern)]
    for (const match of matches) {
      breakPoints.push(match.index + match[0].length)
    }
  }
  
  breakPoints.push(text.length) // End of text
  breakPoints.sort((a, b) => a - b)

  const chunks = []
  let chunkIndex = 0

  for (let i = 0; i < breakPoints.length - 1; i++) {
    const start = breakPoints[i]
    const end = breakPoints[i + 1]
    const chunkText = text.slice(start, end).trim()

    if (chunkText.length >= minSize) {
      // Calculate position metadata using helper function
      const positionMeta = calculatePositionMetadata(text, start, end)
      
      // If chunk is too large, split it further
      if (chunkText.length > maxSize) {
        const subChunks = fixedWindow(chunkText, { 
          size: maxSize, 
          overlap: Math.floor(maxSize * 0.1),
          minSize 
        })
        
        for (const subChunk of subChunks) {
          const subStartPos = start + (subChunk.meta && subChunk.meta.start_pos || 0)
          const subEndPos = start + (subChunk.meta && subChunk.meta.end_pos || subChunk.text.length)
          const subPositionMeta = calculatePositionMetadata(text, subStartPos, subEndPos)
          
          chunks.push({
            ...subChunk,
            chunk_index: chunkIndex++,
            meta: {
              ...subChunk.meta,
              strategy: 'semantic_breaks',
              ...subPositionMeta
            }
          })
        }
      } else {
        chunks.push({
          chunk_index: chunkIndex++,
          text: chunkText,
          overlap_before: 0,
          overlap_after: 0,
          section_path: null,
          page_no: null,
          meta: {
            strategy: 'semantic_breaks',
            chunk_length: chunkText.length,
            ...positionMeta
          }
        })
      }
    }
  }

  return chunks
}

/**
 * Fixed window chunking - chunks text with fixed size windows
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.size - Chunk size in characters (default: 400)
 * @param {number} options.overlap - Overlap size in characters (default: 80)
 * @param {number} options.minSize - Minimum chunk size (default: 200)
 * @returns {Array} Array of chunk objects
 */
function fixedWindow(text, { size = 400, overlap = 80, minSize = 200 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Safety checks
  if (overlap >= size) {
    overlap = Math.max(0, size - 1)
  }
  
  if (minSize >= size) {
    minSize = Math.floor(size / 2)
  }

  const chunks = []
  let i = 0
  let chunkIndex = 0

  console.log('text', text, text.length)
  console.log('size', size)
  console.log('overlap', overlap)
  console.log('minSize', minSize)

  while (i < text.length) {
    const end = Math.min(text.length, i + size)
    let actualEnd = end

    // Find the best boundary if we're not at the end of text
    if (end < text.length) {
      actualEnd = findBestBoundary(text, i, end, minSize)
      
      // If no good boundary found, we might need to extend the chunk
      if (actualEnd === end && actualEnd - i < minSize) {
        const extendedEnd = Math.min(text.length, i + size + (size - minSize))
        actualEnd = findBestBoundary(text, i, extendedEnd, minSize)
      }
    }

    const slice = text.slice(i, actualEnd).trim()
    console.log('slice', slice, slice.length, minSize)
    if (slice.length >= minSize) {
      // Calculate position metadata using helper function
      const positionMeta = calculatePositionMetadata(text, i, actualEnd)

      chunks.push({
        chunk_index: chunkIndex++,
        text: slice,
        overlap_before: i === 0 ? 0 : overlap,
        overlap_after: actualEnd < text.length ? overlap : 0,
        section_path: null,
        page_no: null,
        meta: {
          strategy: 'fixed_window',
          window_size: size,
          chunk_length: slice.length,
          ...positionMeta
        }
      })
    }

    // Move forward, accounting for overlap
    const nextStart = Math.max(i + 1, actualEnd - overlap)
    i = nextStart
  }

  return chunks
}

/**
 * Code blocks chunking - chunks text preserving code blocks as units
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size (default: 200)
 * @param {number} options.maxSize - Maximum chunk size (default: 2000)
 * @returns {Array} Array of chunk objects
 */
function codeBlocks(text, { minSize = 200, maxSize = 2000 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Pattern to match code blocks (markdown and other formats)
  const codeBlockPattern = /```[\s\S]*?```|`[^`\n]+`|^\s{4,}.*$/gm
  const chunks = []
  let chunkIndex = 0
  let lastIndex = 0

  const matches = [...text.matchAll(codeBlockPattern)]
  
  for (const match of matches) {
    const codeBlock = match[0]
    const start = match.index
    const end = start + codeBlock.length

    // Add text before code block if it exists and is substantial
    if (start > lastIndex) {
      const beforeText = text.slice(lastIndex, start).trim()
      if (beforeText.length >= minSize) {
        chunks.push({
          chunk_index: chunkIndex++,
          text: beforeText,
          overlap_before: 0,
          overlap_after: 0,
          section_path: null,
          page_no: null,
          meta: {
            strategy: 'code_blocks',
            type: 'text',
            length: beforeText.length
          }
        })
      }
    }

    // Add code block as its own chunk
    chunks.push({
      chunk_index: chunkIndex++,
      text: codeBlock,
      overlap_before: 0,
      overlap_after: 0,
      section_path: null,
      page_no: null,
      meta: {
        strategy: 'code_blocks',
        type: 'code',
        language: codeBlock.startsWith('```') ? codeBlock.split('\n')[0].slice(3) : 'inline',
        length: codeBlock.length
      }
    })

    lastIndex = end
  }

  // Add remaining text after last code block
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex).trim()
    if (remainingText.length >= minSize) {
      chunks.push({
        chunk_index: chunkIndex++,
        text: remainingText,
        overlap_before: 0,
        overlap_after: 0,
        section_path: null,
        page_no: null,
        meta: {
          strategy: 'code_blocks',
          type: 'text',
          length: remainingText.length
        }
      })
    }
  }

  return chunks
}

/**
 * Tables as units chunking - preserves tables as complete units
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size (default: 200)
 * @returns {Array} Array of chunk objects
 */
function tablesAsUnits(text, { minSize = 200 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Pattern to match markdown tables
  const tablePattern = /^\|.*\|[\r\n]+\|[\s\-\|]*\|[\r\n]+(\|.*\|[\r\n]*)*/gm
  const chunks = []
  let chunkIndex = 0
  let lastIndex = 0

  const matches = [...text.matchAll(tablePattern)]
  
  for (const match of matches) {
    const table = match[0]
    const start = match.index
    const end = start + table.length

    // Add text before table if it exists and is substantial
    if (start > lastIndex) {
      const beforeText = text.slice(lastIndex, start).trim()
      if (beforeText.length >= minSize) {
        chunks.push({
          chunk_index: chunkIndex++,
          text: beforeText,
          overlap_before: 0,
          overlap_after: 0,
          section_path: null,
          page_no: null,
          meta: {
            strategy: 'tables_as_units',
            type: 'text',
            length: beforeText.length
          }
        })
      }
    }

    // Add table as its own chunk
    chunks.push({
      chunk_index: chunkIndex++,
      text: table,
      overlap_before: 0,
      overlap_after: 0,
      section_path: null,
      page_no: null,
      meta: {
        strategy: 'tables_as_units',
        type: 'table',
        rows: table.split('\n').filter(line => line.trim().startsWith('|')).length,
        length: table.length
      }
    })

    lastIndex = end
  }

  // Add remaining text after last table
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex).trim()
    if (remainingText.length >= minSize) {
      chunks.push({
        chunk_index: chunkIndex++,
        text: remainingText,
        overlap_before: 0,
        overlap_after: 0,
        section_path: null,
        page_no: null,
        meta: {
          strategy: 'tables_as_units',
          type: 'text',
          length: remainingText.length
        }
      })
    }
  }

  return chunks
}

/**
 * Slides and pages chunking - chunks presentation slides or pages
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size (default: 200)
 * @returns {Array} Array of chunk objects
 */
function slidesPages(text, { minSize = 200 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Patterns for different slide/page separators
  const slidePatterns = [
    /^Slide\s+\d+/gmi,
    /^Page\s+\d+/gmi,
    /^---+\s*$/gm,
    /^\*\*\*+\s*$/gm,
    /^={3,}\s*$/gm,
    /^#{1,3}\s+(?:Slide|Page)\s+\d+/gmi
  ]

  const chunks = []
  let chunkIndex = 0
  let lastIndex = 0

  // Find all slide/page boundaries
  const boundaries = [0]
  
  for (const pattern of slidePatterns) {
    const matches = [...text.matchAll(pattern)]
    for (const match of matches) {
      boundaries.push(match.index)
    }
  }
  
  boundaries.push(text.length)
  boundaries.sort((a, b) => a - b)

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    const slideText = text.slice(start, end).trim()

    if (slideText.length >= minSize) {
      chunks.push({
        chunk_index: chunkIndex++,
        text: slideText,
        overlap_before: 0,
        overlap_after: 0,
        section_path: null,
        page_no: i + 1,
        meta: {
          strategy: 'slides_pages',
          slide_number: i + 1,
          length: slideText.length
        }
      })
    }
  }

  return chunks
}

/**
 * Email threads chunking - chunks email messages in threads
 * @param {string} text - Text to chunk
 * @param {Object} options - Options
 * @param {number} options.minSize - Minimum chunk size (default: 200)
 * @returns {Array} Array of chunk objects
 */
function emailsThreads(text, { minSize = 200 } = {}) {
  if (!text || text.length === 0) {
    return []
  }

  // Pattern to match email headers
  const emailPattern = /^(From:|To:|Subject:|Date:).*$/gmi
  const chunks = []
  let chunkIndex = 0
  let lastIndex = 0

  const matches = [...text.matchAll(emailPattern)]
  
  for (const match of matches) {
    const start = match.index
    const nextMatch = matches[matches.indexOf(match) + 1]
    const end = nextMatch ? nextMatch.index : text.length
    const emailText = text.slice(start, end).trim()

    if (emailText.length >= minSize) {
      // Extract email metadata
      const fromMatch = emailText.match(/^From:\s*(.+)$/mi)
      const toMatch = emailText.match(/^To:\s*(.+)$/mi)
      const subjectMatch = emailText.match(/^Subject:\s*(.+)$/mi)
      const dateMatch = emailText.match(/^Date:\s*(.+)$/mi)

      chunks.push({
        chunk_index: chunkIndex++,
        text: emailText,
        overlap_before: 0,
        overlap_after: 0,
        section_path: null,
        page_no: null,
        meta: {
          strategy: 'emails_threads',
          from: fromMatch && fromMatch[1] ? fromMatch[1].trim() : null,
          to: toMatch && toMatch[1] ? toMatch[1].trim() : null,
          subject: subjectMatch && subjectMatch[1] ? subjectMatch[1].trim() : null,
          date: dateMatch && dateMatch[1] ? dateMatch[1].trim() : null,
          length: emailText.length
        }
      })
    }

    lastIndex = end
  }

  return chunks
}

module.exports = {
  sentenceWindow,
  headingSection,
  semanticBreaks,
  fixedWindow,
  codeBlocks,
  tablesAsUnits,
  slidesPages,
  emailsThreads,
  findBestBoundary,
  getTokenCount,
  getTokenizer,
  calculatePositionMetadata
}
