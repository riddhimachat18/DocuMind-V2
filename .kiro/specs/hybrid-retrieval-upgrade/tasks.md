# Implementation Plan: Hybrid Retrieval Upgrade

## Overview

This implementation plan converts the hybrid retrieval upgrade design into a series of incremental coding tasks. The plan implements BM25 scoring, RRF fusion, cross-encoder re-ranking, two-pass BRD generation, independent quality scoring, and schema validation while maintaining backward compatibility with existing systems.

## Tasks

- [x] 1. Implement BM25 scoring component
  - [x] 1.1 Create BM25Scorer class with text preprocessing
    - Implement tokenization, lowercasing, punctuation removal
    - Add Unicode handling for international content
    - Create calculateScore method with k1=1.2, b=0.75 parameters
    - _Requirements: 1.1, 1.2, 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 1.2 Write property test for BM25 mathematical correctness
    - **Property 1: BM25 Score Mathematical Correctness**
    - **Validates: Requirements 1.1, 1.5**
  
  - [x] 1.3 Write property test for text preprocessing consistency
    - **Property 2: BM25 Text Preprocessing Consistency**
    - **Validates: Requirements 1.2, 7.1, 7.2, 7.3, 7.4, 7.5**
  
  - [x] 1.4 Add score normalization to 0-1 range
    - Implement normalizeScore method for RRF compatibility
    - Handle edge cases with empty queries and documents
    - _Requirements: 1.4, 1.5_

- [x] 2. Implement RRF fusion component
  - [x] 2.1 Create RRFMerger class with fusion algorithm
    - Implement RRF formula: RRF_score = 1/(k + rank) with k=60
    - Add stable sorting for tied scores
    - Preserve snippet metadata through fusion process
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  
  - [x] 2.2 Write property test for RRF fusion correctness
    - **Property 3: RRF Fusion Algorithm Correctness**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
  
  - [x] 2.3 Add ranking combination logic
    - Handle semantic and keyword ranking inputs
    - Produce unified ranking output
    - _Requirements: 2.4_

- [x] 3. Enhance retrieval pipeline with hybrid scoring
  - [x] 3.1 Modify retrieveForSection to fetch 20 candidates
    - Update ChromaDB query to retrieve 20 snippets instead of 8
    - Maintain existing function signature and caching behavior
    - _Requirements: 3.1, 4.1, 4.4_
  
  - [x] 3.2 Integrate BM25 scoring into retrieval pipeline
    - Calculate BM25 scores for all 20 candidates
    - Apply RRF fusion when both semantic and keyword scores available
    - Return top 8 snippets after fusion ranking
    - _Requirements: 3.2, 3.3, 3.4_
  
  - [x] 3.3 Write property test for hybrid candidate processing
    - **Property 4: Hybrid Retrieval Candidate Processing**
    - **Validates: Requirements 3.2, 3.3**
  
  - [x] 3.4 Write property test for backward compatibility
    - **Property 5: Backward Compatibility Preservation**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

- [x] 4. Checkpoint - Ensure hybrid retrieval tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement cross-encoder re-ranking
  - [x] 5.1 Create CrossEncoderReranker class
    - Research and integrate Node.js compatible cross-encoder model
    - Implement scoreRelevance method for query-document pairs
    - Add batch processing for 20 candidates
    - _Requirements: 9.2, 9.1_
  
  - [x] 5.2 Add re-ranking to retrieval pipeline
    - Score all 20 candidates from RRF fusion
    - Sort by cross-encoder relevance scores descending
    - Return top 8 highest-scoring snippets
    - _Requirements: 9.3, 9.4_
  
  - [x] 5.3 Write property test for cross-encoder scoring completeness
    - **Property 8: Cross-Encoder Scoring Completeness**
    - **Validates: Requirements 9.1, 9.3, 9.5**
  
  - [x] 5.4 Add cross-encoder error handling and fallback
    - Handle model loading failures gracefully
    - Fall back to RRF results on cross-encoder errors
    - Complete operations within 500ms timeout
    - _Requirements: 9.6, 9.7, 9.8_
  
  - [x] 5.5 Write property test for cross-encoder error handling
    - **Property 9: Cross-Encoder Error Handling**
    - **Validates: Requirements 9.6, 9.8**

- [x] 6. Implement comprehensive fallback mechanisms
  - [x] 6.1 Add multi-level fallback hierarchy
    - Implement fallback from hybrid to semantic-only retrieval
    - Add fallback from semantic to keyword-only retrieval
    - Preserve existing scoreSnippet function as final fallback
    - _Requirements: 6.1, 6.2_
  
  - [x] 6.2 Add error logging and monitoring
    - Log all fallback events with context
    - Ensure system never returns empty results when snippets available
    - _Requirements: 6.4, 6.5_
  
  - [x] 6.3 Write property test for fallback behavior consistency
    - **Property 6: Fallback Behavior Consistency**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
  
  - [x] 6.4 Write property test for ChromaDB integration preservation
    - **Property 7: ChromaDB Integration Preservation**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

- [x] 7. Checkpoint - Ensure retrieval system is robust
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement two-pass BRD section generation
  - [x] 8.1 Create TwoPassGenerator class
    - Implement generateSection with two-pass approach
    - Add critiqueAndRewrite method for Pass 2
    - Allocate 2000 token budget across both passes
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 8.2 Integrate two-pass generation into generateBrd.ts
    - Replace existing generateSection calls with TwoPassGenerator
    - Preserve evidence array building and storage mechanisms
    - Maintain function signatures and return formats
    - _Requirements: 10.6, 10.7_
  
  - [x] 8.3 Write property test for token management
    - **Property 10: Two-Pass Generation Token Management**
    - **Validates: Requirements 10.4, 10.5, 10.6**
  
  - [x] 8.4 Add two-pass generation error handling
    - Fall back to Pass 1 draft if Pass 2 fails
    - Handle API failures gracefully
    - _Requirements: 10.8_
  
  - [x] 8.5 Write property test for two-pass fallback
    - **Property 11: Two-Pass Generation Fallback**
    - **Validates: Requirements 10.8**

- [x] 9. Implement independent quality scoring system
  - [x] 9.1 Create IndependentQualityScorer class
    - Implement separate Gemini API call with evaluator prompt
    - Add methods for completeness, clarity, consistency, evidence scoring
    - Return scores in JSON format with 0-100 scale
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_
  
  - [x] 9.2 Replace existing quality scoring in scoreQuality.ts
    - Integrate IndependentQualityScorer while maintaining function interface
    - Add fallback to existing deterministic scoring on API failures
    - _Requirements: 11.11, 11.12_
  
  - [x] 9.3 Write property test for quality evaluation completeness
    - **Property 12: Quality Evaluation Completeness**
    - **Validates: Requirements 11.4, 11.6, 11.7, 11.8, 11.9, 11.10**
  
  - [ ] 9.4 Write property test for quality scoring fallback
    - **Property 13: Quality Scoring Fallback**
    - **Validates: Requirements 11.12**

- [-] 10. Implement schema validation with auto-retry
  - [x] 10.1 Create SchemaValidator class
    - Define TypeScript schema for BRD sections
    - Implement validateSection method with detailed error reporting
    - Add retryGeneration method with validation errors in prompt
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 10.2 Integrate schema validation into section generation
    - Validate each section before storage
    - Retry generation once on validation failure
    - Flag sections with "NEEDS_REVIEW" on second failure
    - _Requirements: 12.4, 12.5_
  
  - [x] 10.3 Write property test for schema validation round-trip
    - **Property 14: Schema Validation Round-Trip**
    - **Validates: Requirements 12.1, 12.3, 12.4**
  
  - [x] 10.4 Add schema validation error handling
    - Log validation failures with specific error details
    - Never silently save invalid sections
    - Handle errors without breaking BRD generation process
    - _Requirements: 12.6, 12.7, 12.8_
  
  - [x] 10.5 Write property test for schema validation safety
    - **Property 15: Schema Validation Safety**
    - **Validates: Requirements 12.5, 12.6, 12.8**

- [x] 11. Performance optimization and monitoring
  - [x] 11.1 Add performance monitoring and metrics
    - Track retrieval latency, BM25 calculation time, RRF fusion duration
    - Monitor cross-encoder inference time and quality score distributions
    - Log performance metrics for analysis
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 11.2 Optimize concurrent section processing
    - Ensure no performance degradation with multiple simultaneous retrievals
    - Implement batch processing for memory efficiency
    - _Requirements: 5.5_
  
  - [x] 11.3 Write unit tests for performance boundaries
    - Test candidate counts (20 input, 8 output)
    - Verify timeout thresholds and token limits
    - Test memory usage during processing

- [x] 12. Final integration and wiring
  - [x] 12.1 Update retrieval.ts with complete hybrid system
    - Wire together BM25Scorer, RRFMerger, and CrossEncoderReranker
    - Ensure all components work together seamlessly
    - Maintain existing cache invalidation and project filtering
    - _Requirements: 8.1, 8.5_
  
  - [x] 12.2 Update generateBrd.ts with enhanced pipeline
    - Integrate TwoPassGenerator and SchemaValidator
    - Connect IndependentQualityScorer to BRD generation
    - Preserve existing function signatures and return formats
    - _Requirements: 4.1, 4.2_
  
  - [x] 12.3 Write integration tests for complete pipeline
    - Test end-to-end retrieval from query to ranked results
    - Verify BRD generation with two-pass and schema validation
    - Test quality scoring with independent evaluator

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples, edge cases, and integration points
- The implementation maintains backward compatibility while adding hybrid retrieval capabilities
- All components include comprehensive error handling and fallback mechanisms