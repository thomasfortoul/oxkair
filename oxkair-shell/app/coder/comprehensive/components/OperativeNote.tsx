"use client"

import React from "react"

interface HighlightedTextProps {
  text: string
  highlights: string[]
  evidenceDescription?: string
}

function HighlightedText({ text, highlights, evidenceDescription }: HighlightedTextProps) {
  if (!highlights.length) return <span>{text}</span>

  let highlightedText = text
  let hasHighlight = false
  let firstHighlightProcessed = false

  // Helper function to escape special regex characters
  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // Helper function to create flexible whitespace regex pattern
  const createFlexiblePattern = (highlight: string): string => {
    // First, handle literal \n characters that come from AI responses
    let processedHighlight = highlight
      .replace(/\\n/g, '\n')  // Convert literal \n to actual newlines
      .replace(/\\r/g, '\r')  // Convert literal \r to actual carriage returns
      .replace(/\\t/g, '\t')  // Convert literal \t to actual tabs
    
    // Handle ellipsis by splitting the text into separate segments
    const segments = processedHighlight.split(/\s*\.\.\.\s*/).map(segment => segment.trim()).filter(segment => segment.length > 0)
    
    if (segments.length > 1) {
      // If there are ellipses, create separate patterns for each segment
      return segments.map(segment => {
        const normalizedSegment = segment
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
        const words = normalizedSegment.split(' ').filter(word => word.length > 0)
        return words.map(word => escapeRegex(word)).join('\\s+')
      }).join('|')  // Use OR to match any of the segments
    }
    
    // No ellipsis - process normally
    const normalizedHighlight = processedHighlight
      .trim()
      .replace(/[\r\n\t]+/g, ' ')  // Replace newlines, carriage returns, tabs with spaces
      .replace(/\s+/g, ' ')        // Collapse multiple spaces into single space
    
    const words = normalizedHighlight.split(' ').filter(word => word.length > 0)
    
    if (words.length === 1) {
      // Single word - just escape it
      return escapeRegex(words[0])
    }
    
    // Multiple words - allow flexible whitespace but be more restrictive
    // Only allow reasonable amounts of whitespace and punctuation between words
    return words.map(word => escapeRegex(word)).join('\\s+')
  }

  highlights.forEach((highlight) => {
    if (highlight && typeof highlight === 'string' && highlight.trim()) {
      try {
        // First, try to split the highlight by sentence boundaries to handle evidence that spans multiple sections
        const sentences = highlight.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0)
        
        if (sentences.length > 1) {
          // Handle multi-sentence evidence by trying to match each sentence separately
          let sentenceHighlighted = false
          sentences.forEach((sentence, index) => {
            if (sentence.length > 10) { // Only process meaningful sentences
              try {
                const sentencePattern = createFlexiblePattern(sentence)
                const sentenceRegex = new RegExp(`(${sentencePattern})`, "gi")
                
                if (sentenceRegex.test(text)) {
                  hasHighlight = true
                  sentenceHighlighted = true
                  sentenceRegex.lastIndex = 0
                  
                  if (!firstHighlightProcessed && evidenceDescription && index === 0) {
                    highlightedText = highlightedText.replace(sentenceRegex, `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-2 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div><mark class="evidence-highlight">$1</mark>`)
                    firstHighlightProcessed = true
                  } else {
                    highlightedText = highlightedText.replace(sentenceRegex, `<mark class="evidence-highlight">$1</mark>`)
                  }
                }
              } catch (sentenceError) {
                console.warn('Sentence regex failed:', sentence, sentenceError)
              }
            }
          })
          
          if (sentenceHighlighted) {
            return // Skip the original full-text matching if we successfully highlighted sentences
          }
        }
        
        // Original logic for single-sentence or fallback matching
        const flexiblePattern = createFlexiblePattern(highlight)
        const regex = new RegExp(`(${flexiblePattern})`, "gi")
        const colorClass = "evidence-highlight"

        // Test if the pattern matches in the text
        if (regex.test(text)) {
          hasHighlight = true
          // Reset regex lastIndex for replacement
          regex.lastIndex = 0
          
          if (!firstHighlightProcessed && evidenceDescription) {
            highlightedText = highlightedText.replace(regex, `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-2 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div><mark class="${colorClass}">$1</mark>`)
            firstHighlightProcessed = true
          } else {
            highlightedText = highlightedText.replace(regex, `<mark class="${colorClass}">$1</mark>`)
          }
        }
      } catch (regexError) {
        // Fallback to normalized text matching if regex fails
        console.warn('Regex pattern failed for highlight:', highlight, regexError)
        
        // First, handle literal escape characters in fallback too
        let processedFallbackHighlight = highlight
          .replace(/\\n/g, '\n')  // Convert literal \n to actual newlines
          .replace(/\\r/g, '\r')  // Convert literal \r to actual carriage returns
          .replace(/\\t/g, '\t')  // Convert literal \t to actual tabs
        
        // Normalize both the highlight and text for comparison
        const normalizedHighlight = processedFallbackHighlight
          .trim()
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .toLowerCase()
        
        const normalizedText = text
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .toLowerCase()
        
        // Handle ellipses in fallback as well
        const segments = processedFallbackHighlight.split(/\s*\.\.\.\s*/).map(segment => segment.trim()).filter(segment => segment.length > 0)
        
        if (segments.length > 1) {
          // Handle each segment separately for ellipsis cases
          let segmentHighlighted = false
          segments.forEach(segment => {
            const segmentNormalized = segment
              .trim()
              .replace(/[\r\n\t]+/g, ' ')
              .replace(/\s+/g, ' ')
              .toLowerCase()
            
            if (normalizedText.includes(segmentNormalized)) {
              hasHighlight = true
              segmentHighlighted = true
              const segmentRegex = new RegExp(`(${escapeRegex(segment)})`, "gi")
              if (!firstHighlightProcessed && evidenceDescription) {
                highlightedText = highlightedText.replace(segmentRegex, `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-2 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div><mark class="evidence-highlight">$1</mark>`)
                firstHighlightProcessed = true
              } else {
                highlightedText = highlightedText.replace(segmentRegex, `<mark class="evidence-highlight">$1</mark>`)
              }
            }
          })
          
          if (segmentHighlighted) {
            return // Skip the rest of the fallback logic
          }
        }
        
        // Check if we can find a substantial portion of the evidence
        const words = normalizedHighlight.split(' ').filter(word => word.length > 2) // Only meaningful words
        const foundWords = words.filter(word => normalizedText.includes(word.toLowerCase()))
        
        // If we find at least 40% of meaningful words (lowered threshold for better matching), proceed with highlighting
        if (foundWords.length >= Math.max(2, Math.floor(words.length * 0.4))) {
          hasHighlight = true
          
          // Try to find and highlight continuous sequences of words - but be more restrictive
          const fallbackPattern = foundWords.slice(0, 3).map(word => escapeRegex(word)).join('\\s+')
          
          try {
            const fallbackRegex = new RegExp(`(${fallbackPattern})`, "gi")
            if (fallbackRegex.test(text)) {
              hasHighlight = true
              fallbackRegex.lastIndex = 0 // Reset for replacement
              if (!firstHighlightProcessed && evidenceDescription) {
                highlightedText = highlightedText.replace(fallbackRegex, `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-2 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div><mark class="evidence-highlight">$1</mark>`)
                firstHighlightProcessed = true
              } else {
                highlightedText = highlightedText.replace(fallbackRegex, `<mark class="evidence-highlight">$1</mark>`)
              }
            } else {
              throw new Error('Fallback pattern did not match')
            }
          } catch (fallbackError) {
            // Final fallback - highlight individual meaningful words
            console.warn('Fallback regex also failed, using individual word highlighting:', fallbackError)
            hasHighlight = true
            foundWords.slice(0, 5).forEach(word => { // Limit to first 5 words to avoid over-highlighting
              const wordRegex = new RegExp(`\\b(${escapeRegex(word)})\\b`, "gi")
              highlightedText = highlightedText.replace(wordRegex, `<mark class="evidence-highlight">$1</mark>`)
            })
            
            // Add evidence description if we haven't already
            if (!firstHighlightProcessed && evidenceDescription) {
              highlightedText = `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-2 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div>` + highlightedText
              firstHighlightProcessed = true
            }
          }
        }
      }
    }
  })

  if (!hasHighlight && evidenceDescription) {
    highlightedText = `<div class="evidence-description bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 rounded-r text-sm text-blue-800 font-medium shadow-sm">${evidenceDescription}</div>` + highlightedText
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{
        __html: `
          .evidence-highlight {
            animation: highlight-pulse 2s ease-in-out 3;
            border-radius: 4px;
            padding: 2px 4px;
          }
          
          @keyframes highlight-pulse {
            0%, 100% { 
              background-color: rgb(219 234 254);
              transform: scale(1);
              box-shadow: 0 0 0 rgba(59, 130, 246, 0);
            }
            50% { 
              background-color: rgb(147 197 253);
              transform: scale(1.02);
              box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
            }
          }
          
          .evidence-description {
            animation: slide-in 0.5s ease-out;
          }
          
          @keyframes slide-in {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `
      }} />
      <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
    </div>
  )
}

interface OperativeNoteProps {
  operativeNoteRef: React.RefObject<HTMLDivElement | null>
  noteContent: string
  contextualContent: {
    highlight?: string | string[]
    evidenceDescription?: string
  } | null
}

export function OperativeNote({ operativeNoteRef, noteContent, contextualContent }: OperativeNoteProps) {
  return (
    <main className="w-3/5 overflow-y-auto scrollbar-hide py-8 pl-8 pr-16 bg-white h-full" ref={operativeNoteRef}>
      <article className="pb-8">
        <h2 className="text-lg font-medium mb-6 text-black border-b border-blue-100 pb-2">Operative Note</h2>
        <div className="text-sm leading-relaxed text-gray-700 space-y-2 whitespace-pre-line">
          <HighlightedText
            text={noteContent}
            highlights={contextualContent?.highlight ?
              (Array.isArray(contextualContent.highlight) ? contextualContent.highlight : [contextualContent.highlight])
              : []
            }
            evidenceDescription={contextualContent?.evidenceDescription}
          />
        </div>
      </article>
    </main>
  )
}