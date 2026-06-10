const { SummarizerManager } = require('node-summarizer')

/**
 * Text enrichment tools for processing and enhancing chunks
 */

/**
 * Normalize text by cleaning whitespace, removing extra characters, and standardizing format
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\r/g, '\n')    // Convert remaining \r to \n
    .replace(/\n{3,}/g, '\n\n')  // Reduce multiple newlines to double
    .replace(/[ \t]+/g, ' ')  // Normalize whitespace
    .replace(/^\s+|\s+$/g, '')  // Trim start and end
    .replace(/\s+\n/g, '\n')  // Remove trailing spaces before newlines
    .replace(/\n\s+/g, '\n')  // Remove leading spaces after newlines
}

/**
 * Remove near-duplicate chunks based on similarity threshold
 * @param {Array} chunks - Array of chunk objects
 * @param {Object} options - Options
 * @param {number} options.threshold - Similarity threshold (0-1, default: 0.8)
 * @param {number} options.minLength - Minimum chunk length to consider (default: 50)
 * @param {string} options.algorithm - Similarity algorithm: 'jaccard', 'cosine', 'ngram', 'hybrid' (default: 'hybrid')
 * @param {number} options.ngramSize - N-gram size for ngram algorithm (default: 3)
 * @param {boolean} options.caseSensitive - Whether to consider case in similarity (default: false)
 * @param {number} options.maxComparisons - Maximum comparisons per chunk for performance (default: 50)
 * @returns {Array} Array of unique chunks
 */
function dedupeNearDuplicate(chunks, { 
  threshold = 0.8, 
  minLength = 50, 
  algorithm = 'hybrid',
  ngramSize = 3,
  caseSensitive = false,
  maxComparisons = 50
} = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return []
  }

  // Pre-process chunks and create lookup structures for performance
  const processedChunks = []
  const textHashes = new Map() // For exact duplicate detection
  const lengthBuckets = new Map() // Group by length for faster comparison
  const ngramIndex = new Map() // N-gram index for fast similarity search

  // First pass: normalize and categorize chunks
  for (const chunk of chunks) {
    // Skip chunks that are too short, but preserve fallback chunks
    if (!chunk.text || (chunk.text.length < minLength && !(chunk.meta && chunk.meta.fallback_reason))) {
      continue
    }

    const normalizedText = normalizeText(chunk.text)
    const textHash = createTextHash(normalizedText, caseSensitive)
    
    // Skip exact duplicates immediately
    if (textHashes.has(textHash)) {
      continue
    }

    const processedChunk = {
      ...chunk,
      text: normalizedText,
      textHash,
      length: normalizedText.length,
      words: normalizedText.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    }

    processedChunks.push(processedChunk)
    textHashes.set(textHash, processedChunk)
    
    // Group by length for faster comparison
    const lengthBucket = Math.floor(processedChunk.length / 100) * 100
    if (!lengthBuckets.has(lengthBucket)) {
      lengthBuckets.set(lengthBucket, [])
    }
    lengthBuckets.get(lengthBucket).push(processedChunk)

    // Build n-gram index for fast similarity search
    if (algorithm === 'ngram' || algorithm === 'hybrid') {
      const ngrams = generateNGrams(normalizedText, ngramSize, caseSensitive)
      for (const ngram of ngrams) {
        if (!ngramIndex.has(ngram)) {
          ngramIndex.set(ngram, [])
        }
        ngramIndex.get(ngram).push(processedChunk)
      }
    }
  }

  const uniqueChunks = []
  const processedTexts = new Set()

  // Second pass: find near-duplicates using optimized algorithms
  for (const chunk of processedChunks) {
    if (processedTexts.has(chunk.textHash)) {
      continue
    }

    let isDuplicate = false
    let comparisons = 0

    // Get candidates for comparison using different strategies
    const candidates = getSimilarityCandidates(chunk, {
      lengthBuckets,
      ngramIndex,
      algorithm,
      ngramSize,
      maxCandidates: maxComparisons * 2
    })

    // Compare with candidates using selected algorithm
    for (const candidate of candidates) {
      if (comparisons >= maxComparisons) break
      if (candidate === chunk || processedTexts.has(candidate.textHash)) continue

      const similarity = calculateSimilarityAdvanced(chunk, candidate, {
        algorithm,
        ngramSize,
        caseSensitive
      })

      if (similarity >= threshold) {
        isDuplicate = true
        break
      }
      comparisons++
    }

    if (!isDuplicate) {
      processedTexts.add(chunk.textHash)
      uniqueChunks.push({
        ...chunk,
        text: chunk.text
      })
    }
  }

  return uniqueChunks
}

/**
 * Create a hash for text to detect exact duplicates
 * @param {string} text - Text to hash
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {string} Text hash
 */
function createTextHash(text, caseSensitive = false) {
  const normalized = caseSensitive ? text : text.toLowerCase()
  return Buffer.from(normalized).toString('base64')
}

/**
 * Generate n-grams from text
 * @param {string} text - Text to process
 * @param {number} n - N-gram size
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {Array} Array of n-grams
 */
function generateNGrams(text, n = 3, caseSensitive = false) {
  const normalized = caseSensitive ? text : text.toLowerCase()
  const words = normalized.split(/\s+/).filter(w => w.length > 0)
  const ngrams = []
  
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '))
  }
  
  return ngrams
}

/**
 * Get similarity candidates using various optimization strategies
 * @param {Object} chunk - Current chunk
 * @param {Object} options - Options
 * @returns {Array} Array of candidate chunks for comparison
 */
function getSimilarityCandidates(chunk, { lengthBuckets, ngramIndex, algorithm, ngramSize, maxCandidates }) {
  const candidates = new Set()
  
  // Strategy 1: Length-based bucketing (fastest)
  const lengthBucket = Math.floor(chunk.length / 100) * 100
  const sameLengthChunks = lengthBuckets.get(lengthBucket) || []
  const adjacentLengthChunks = [
    ...(lengthBuckets.get(lengthBucket - 100) || []),
    ...(lengthBuckets.get(lengthBucket + 100) || [])
  ]
  
  // Add chunks from same and adjacent length buckets
  const lengthBasedCandidates = [...sameLengthChunks, ...adjacentLengthChunks]
  lengthBasedCandidates.forEach(c => {
    if (c !== chunk) candidates.add(c)
  })
  
  // Strategy 2: N-gram based candidate selection (for ngram/hybrid algorithms)
  if (algorithm === 'ngram' || algorithm === 'hybrid') {
    const chunkNgrams = generateNGrams(chunk.text, ngramSize, false)
    const ngramCandidates = new Map()
    
    // Find chunks that share n-grams with current chunk
    for (const ngram of chunkNgrams) {
      if (ngramIndex.has(ngram)) {
        ngramIndex.get(ngram).forEach(candidate => {
          if (candidate !== chunk) {
            ngramCandidates.set(candidate, (ngramCandidates.get(candidate) || 0) + 1)
          }
        })
      }
    }
    
    // Sort by n-gram overlap and add top candidates
    const sortedCandidates = Array.from(ngramCandidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCandidates / 2)
      .map(([candidate]) => candidate)
    
    sortedCandidates.forEach(c => candidates.add(c))
  }
  
  // Convert to array and limit size
  return Array.from(candidates).slice(0, maxCandidates)
}

/**
 * Calculate advanced similarity between two chunks using multiple algorithms
 * @param {Object} chunk1 - First chunk
 * @param {Object} chunk2 - Second chunk
 * @param {Object} options - Options
 * @returns {number} Similarity score between 0 and 1
 */
function calculateSimilarityAdvanced(chunk1, chunk2, { algorithm, ngramSize, caseSensitive }) {
  switch (algorithm) {
    case 'jaccard':
      return calculateJaccardSimilarity(chunk1, chunk2, caseSensitive)
    case 'cosine':
      return calculateCosineSimilarity(chunk1, chunk2, caseSensitive)
    case 'ngram':
      return calculateNgramSimilarity(chunk1, chunk2, ngramSize, caseSensitive)
    case 'hybrid':
      return calculateHybridSimilarity(chunk1, chunk2, ngramSize, caseSensitive)
    default:
      return calculateJaccardSimilarity(chunk1, chunk2, caseSensitive)
  }
}

/**
 * Calculate Jaccard similarity between two chunks
 * @param {Object} chunk1 - First chunk
 * @param {Object} chunk2 - Second chunk
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {number} Jaccard similarity score
 */
function calculateJaccardSimilarity(chunk1, chunk2, caseSensitive = false) {
  const words1 = new Set(caseSensitive ? chunk1.words : chunk1.words.map(w => w.toLowerCase()))
  const words2 = new Set(caseSensitive ? chunk2.words : chunk2.words.map(w => w.toLowerCase()))
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Calculate cosine similarity between two chunks
 * @param {Object} chunk1 - First chunk
 * @param {Object} chunk2 - Second chunk
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {number} Cosine similarity score
 */
function calculateCosineSimilarity(chunk1, chunk2, caseSensitive = false) {
  const words1 = caseSensitive ? chunk1.words : chunk1.words.map(w => w.toLowerCase())
  const words2 = caseSensitive ? chunk2.words : chunk2.words.map(w => w.toLowerCase())
  
  // Create word frequency vectors
  const freq1 = {}
  const freq2 = {}
  
  words1.forEach(word => freq1[word] = (freq1[word] || 0) + 1)
  words2.forEach(word => freq2[word] = (freq2[word] || 0) + 1)
  
  // Get all unique words
  const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)])
  
  // Calculate dot product and magnitudes
  let dotProduct = 0
  let magnitude1 = 0
  let magnitude2 = 0
  
  for (const word of allWords) {
    const f1 = freq1[word] || 0
    const f2 = freq2[word] || 0
    
    dotProduct += f1 * f2
    magnitude1 += f1 * f1
    magnitude2 += f2 * f2
  }
  
  const magnitude = Math.sqrt(magnitude1) * Math.sqrt(magnitude2)
  return magnitude > 0 ? dotProduct / magnitude : 0
}

/**
 * Calculate n-gram similarity between two chunks
 * @param {Object} chunk1 - First chunk
 * @param {Object} chunk2 - Second chunk
 * @param {number} ngramSize - N-gram size
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {number} N-gram similarity score
 */
function calculateNgramSimilarity(chunk1, chunk2, ngramSize, caseSensitive = false) {
  const ngrams1 = new Set(generateNGrams(chunk1.text, ngramSize, caseSensitive))
  const ngrams2 = new Set(generateNGrams(chunk2.text, ngramSize, caseSensitive))
  
  const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)))
  const union = new Set([...ngrams1, ...ngrams2])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Calculate hybrid similarity combining multiple algorithms
 * @param {Object} chunk1 - First chunk
 * @param {Object} chunk2 - Second chunk
 * @param {number} ngramSize - N-gram size
 * @param {boolean} caseSensitive - Whether to consider case
 * @returns {number} Hybrid similarity score
 */
function calculateHybridSimilarity(chunk1, chunk2, ngramSize, caseSensitive = false) {
  const jaccard = calculateJaccardSimilarity(chunk1, chunk2, caseSensitive)
  const cosine = calculateCosineSimilarity(chunk1, chunk2, caseSensitive)
  const ngram = calculateNgramSimilarity(chunk1, chunk2, ngramSize, caseSensitive)
  
  // Weighted combination: Jaccard (40%), Cosine (35%), N-gram (25%)
  return (jaccard * 0.4) + (cosine * 0.35) + (ngram * 0.25)
}

/**
 * Generate a summary for a chunk using node-summarizer with fallback
 * @param {string} text - Text to summarize
 * @param {Object} options - Options
 * @param {number} options.maxLength - Maximum summary length (default: 80)
 * @param {string} options.algorithm - Algorithm to use: 'textrank', 'frequency', 'hybrid' (default: 'hybrid')
 * @returns {Promise<string>} Summary text
 */
async function chunkSummary(text, { maxLength = 80, algorithm = 'hybrid' } = {}) {
  if (!text || typeof text !== 'string') {
    return ''
  }

  const normalizedText = normalizeText(text)
  
  if (normalizedText.length <= maxLength) {
    return normalizedText
  }

  // Try to use node-summarizer if available
  try {
    const summarizer = new SummarizerManager(normalizedText)
    
    let summary
    if (algorithm === 'textrank') {
      const result = await summarizer.getSummaryByRank(1) // Get 1 sentence using TextRank
      summary = result.summary || result
    } else if (algorithm === 'frequency') {
      const result = summarizer.getSummaryByFrequency(1) // Get 1 sentence using frequency
      summary = result.summary
    } else {
      // Hybrid: try TextRank first, fallback to frequency
      try {
        const result = await summarizer.getSummaryByRank(1)
        summary = result.summary || result
      } catch {
        const result = summarizer.getSummaryByFrequency(1)
        summary = result.summary
      }
    }
    
    if (summary && typeof summary === 'string' && summary.length <= maxLength) {
      return summary
    }
    
    if (summary && typeof summary === 'string') {
      return summary.slice(0, maxLength - 3) + '...'
    }
  } catch (error) {
    // Fallback to enhanced extractive summarization if node-summarizer not available
    console.warn('node-summarizer not available, using fallback:', error.message)
  }

  // Enhanced fallback implementation
  return enhancedExtractiveSummary(normalizedText, { maxLength })
}

/**
 * Enhanced extractive summarization fallback
 * @param {string} text - Text to summarize
 * @param {Object} options - Options
 * @param {number} options.maxLength - Maximum summary length
 * @returns {string} Summary text
 */
function enhancedExtractiveSummary(text, { maxLength = 80 } = {}) {
  // Split into sentences with better regex
  const sentences = text.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)

  if (sentences.length <= 1) {
    return text.slice(0, maxLength - 3) + '...'
  }

  // Calculate sentence scores using multiple factors
  const scores = calculateSentenceScores(sentences)
  
  // Select best sentence
  const bestIndex = scores.indexOf(Math.max(...scores))
  const bestSentence = sentences[bestIndex]

  if (bestSentence.length <= maxLength) {
    return bestSentence
  }

  // Truncate at word boundary
  const words = bestSentence.split(/\s+/)
  let summary = ''
  
  for (const word of words) {
    if ((summary + ' ' + word).trim().length <= maxLength - 3) {
      summary += (summary ? ' ' : '') + word
    } else {
      break
    }
  }
  
  return summary.trim() + '...'
}

/**
 * Calculate sentence scores for extractive summarization
 * @param {string[]} sentences - Array of sentences
 * @returns {number[]} Array of scores
 */
function calculateSentenceScores(sentences) {
  const scores = new Array(sentences.length).fill(0)
  
  // Word frequency scoring
  const wordFreq = {}
  sentences.forEach(sentence => {
    const words = sentence.toLowerCase().split(/\s+/)
    words.forEach(word => {
      if (word.length > 3) { // Only consider meaningful words
        wordFreq[word] = (wordFreq[word] || 0) + 1
      }
    })
  })

  // Calculate scores for each sentence
  sentences.forEach((sentence, index) => {
    const words = sentence.toLowerCase().split(/\s+/)
    let score = 0
    
    // Word frequency score
    words.forEach(word => {
      if (word.length > 3) {
        score += wordFreq[word] || 0
      }
    })
    
    // Position score (first and last sentences get bonus)
    if (index === 0) score *= 1.5 // First sentence is often important
    if (index === sentences.length - 1) score *= 1.2 // Last sentence often contains conclusions
    
    // Length penalty for very short/long sentences
    const length = sentence.length
    if (length < 20) score *= 0.5
    if (length > 200) score *= 0.8
    
    // Bonus for sentences with question words (often important)
    if (/^(what|how|why|when|where|who|which)/i.test(sentence.trim())) {
      score *= 1.3
    }
    
    scores[index] = score
  })

  return scores
}

/**
 * Expand passages by adding context from surrounding content
 * @param {string} text - Text to expand
 * @param {string} fullText - Full document text for context
 * @param {Object} options - Options
 * @param {number} options.contextLength - Target length of context to add (default: 200)
 * @param {boolean} options.respectBoundaries - Respect word/sentence boundaries (default: true)
 * @param {string} options.boundaryType - Boundary type: 'word', 'sentence', 'paragraph' (default: 'sentence')
 * @param {number} options.maxContextRatio - Maximum context as ratio of original text (default: 2.0)
 * @param {boolean} options.avoidOverlap - Try to avoid overlapping with existing chunk content (default: true)
 * @returns {string} Expanded text
 */
function passageExpansion(text, fullText, { 
  contextLength = 200, 
  respectBoundaries = true,
  boundaryType = 'sentence',
  maxContextRatio = 2.0,
  avoidOverlap = true
} = {}) {
  if (!text || !fullText) {
    return text || ''
  }

  // Find text position with better error handling
  const textIndex = fullText.indexOf(text)
  if (textIndex === -1) {
    return text
  }

  const textLength = text.length
  const maxContextLength = Math.min(contextLength, textLength * maxContextRatio)
  
  // Calculate context positions
  const beforeStart = Math.max(0, textIndex - maxContextLength)
  const afterEnd = Math.min(fullText.length, textIndex + textLength + maxContextLength)
  
  let beforeContext = fullText.slice(beforeStart, textIndex)
  let afterContext = fullText.slice(textIndex + textLength, afterEnd)
  
  // Apply boundary respect if enabled
  if (respectBoundaries) {
    beforeContext = adjustContextToBoundary(beforeContext, boundaryType, 'end')
    afterContext = adjustContextToBoundary(afterContext, boundaryType, 'start')
  }
  
  // Avoid overlap if enabled and we have previous context
  if (avoidOverlap && beforeContext) {
    beforeContext = removeOverlappingContent(beforeContext, text)
  }
  
  const expandedText = (beforeContext + text + afterContext).trim()
  
  // Ensure we don't exceed reasonable limits
  const maxTotalLength = textLength * (1 + maxContextRatio)
  if (expandedText.length > maxTotalLength) {
    return text // Return original if expansion would be too large
  }
  
  return expandedText
}

/**
 * Adjust context to respect word/sentence/paragraph boundaries
 * @param {string} context - Context text to adjust
 * @param {string} boundaryType - Type of boundary to respect
 * @param {string} position - Position relative to main text: 'start' or 'end'
 * @returns {string} Adjusted context
 */
function adjustContextToBoundary(context, boundaryType, position) {
  if (!context) return context
  
  switch (boundaryType) {
    case 'word':
      return adjustToWordBoundary(context, position)
    case 'sentence':
      return adjustToSentenceBoundary(context, position)
    case 'paragraph':
      return adjustToParagraphBoundary(context, position)
    default:
      return context
  }
}

/**
 * Adjust context to word boundaries
 */
function adjustToWordBoundary(context, position) {
  if (position === 'start') {
    // Find first complete word
    const firstSpace = context.indexOf(' ')
    return firstSpace > 0 ? context.slice(firstSpace + 1) : context
  } else {
    // Find last complete word
    const lastSpace = context.lastIndexOf(' ')
    return lastSpace > 0 ? context.slice(0, lastSpace) : context
  }
}

/**
 * Adjust context to sentence boundaries
 */
function adjustToSentenceBoundary(context, position) {
  const sentenceEndings = /[.!?]+/
  
  if (position === 'start') {
    // Find first complete sentence
    const match = context.search(sentenceEndings)
    return match > 0 ? context.slice(match + 1).trim() : context
  } else {
    // Find last complete sentence
    const sentences = context.split(sentenceEndings)
    if (sentences.length > 1) {
      return sentences.slice(0, -1).join('.').trim()
    }
    return context
  }
}

/**
 * Adjust context to paragraph boundaries
 */
function adjustToParagraphBoundary(context, position) {
  const paragraphs = context.split(/\n\s*\n/)
  
  if (position === 'start') {
    return paragraphs.length > 1 ? paragraphs.slice(1).join('\n\n') : context
  } else {
    return paragraphs.length > 1 ? paragraphs.slice(0, -1).join('\n\n') : context
  }
}

/**
 * Remove content that overlaps with the main text
 * @param {string} context - Context text
 * @param {string} mainText - Main text to avoid overlapping
 * @returns {string} Context with overlapping content removed
 */
function removeOverlappingContent(context, mainText) {
  if (!context || !mainText) return context
  
  // Simple approach: remove common phrases at the end of context
  const mainWords = mainText.toLowerCase().split(/\s+/).slice(0, 5) // First 5 words
  const contextWords = context.toLowerCase().split(/\s+/)
  
  // Find overlap at the end of context
  let overlapIndex = -1
  for (let i = contextWords.length - 1; i >= 0; i--) {
    const remainingWords = contextWords.slice(i)
    if (remainingWords.some(word => mainWords.includes(word))) {
      overlapIndex = i
      break
    }
  }
  
  if (overlapIndex > 0) {
    return contextWords.slice(0, overlapIndex).join(' ')
  }
  
  return context
}

/**
 * Detect language of text (placeholder implementation)
 * @param {string} text - Text to analyze
 * @returns {string} Detected language code
 */
function languageDetect(text) {
  if (!text || typeof text !== 'string') {
    return 'unknown'
  }

  // Simple language detection based on common patterns
  const patterns = {
    'en': /\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/gi,
    'es': /\b(el|la|los|las|de|del|en|con|por|para|que|y|o|pero)\b/gi,
    'fr': /\b(le|la|les|de|du|des|en|avec|pour|que|et|ou|mais)\b/gi,
    'de': /\b(der|die|das|und|oder|aber|in|mit|für|von|zu)\b/gi,
    'it': /\b(il|la|i|le|di|del|della|in|con|per|che|e|o|ma)\b/gi
  }

  let maxMatches = 0
  let detectedLang = 'unknown'

  for (const [lang, pattern] of Object.entries(patterns)) {
    const matches = (text.match(pattern) || []).length
    if (matches > maxMatches) {
      maxMatches = matches
      detectedLang = lang
    }
  }

  return detectedLang
}

/**
 * Extract markdown frontmatter from text
 * @param {string} text - Text to analyze
 * @returns {Object} Frontmatter object
 */
function extractFrontmatter(text) {
  if (!text || typeof text !== 'string') {
    return {}
  }

  const frontmatterPattern = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = text.match(frontmatterPattern)
  
  if (!match) {
    return {}
  }

  const frontmatterText = match[1]
  const frontmatter = {}
  
  // Simple YAML-like parsing
  const lines = frontmatterText.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '')
      frontmatter[key] = value
    }
  }
  
  return frontmatter
}

/**
 * Extract table data as CSV format
 * @param {string} text - Text containing table
 * @returns {string} CSV representation
 */
function extractTableCsv(text) {
  if (!text || typeof text !== 'string') {
    return ''
  }

  // Find markdown table
  const tableMatch = text.match(/^\|.*\|[\r\n]+\|[\s\-\|]*\|[\r\n]+(\|.*\|[\r\n]*)*/m)
  if (!tableMatch) {
    return ''
  }

  const tableText = tableMatch[0]
  const rows = tableText.split('\n').filter(line => line.trim().startsWith('|'))
  
  return rows.map(row => {
    return row.split('|')
      .slice(1, -1) // Remove empty first and last elements
      .map(cell => cell.trim())
      .join(',')
  }).join('\n')
}

/**
 * Extract table data as JSON format
 * @param {string} text - Text containing table
 * @returns {Object} JSON representation
 */
function extractTableJson(text) {
  if (!text || typeof text !== 'string') {
    return {}
  }

  const csv = extractTableCsv(text)
  if (!csv) {
    return {}
  }

  const lines = csv.split('\n')
  if (lines.length < 2) {
    return {}
  }

  const headers = lines[0].split(',')
  const data = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row = {}
    
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    
    data.push(row)
  }

  return { headers, data }
}

module.exports = {
  normalizeText,
  dedupeNearDuplicate,
  chunkSummary,
  enhancedExtractiveSummary,
  calculateSentenceScores,
  passageExpansion,
  languageDetect,
  extractFrontmatter,
  extractTableCsv,
  extractTableJson,
  // New similarity functions
  calculateSimilarityAdvanced,
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateNgramSimilarity,
  calculateHybridSimilarity,
  generateNGrams,
  createTextHash,
  // New passage expansion helper functions
  adjustContextToBoundary,
  adjustToWordBoundary,
  adjustToSentenceBoundary,
  adjustToParagraphBoundary,
  removeOverlappingContent
}
