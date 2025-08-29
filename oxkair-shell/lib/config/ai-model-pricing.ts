/**
 * AI Model Pricing Configuration
 * 
 * This file contains pricing information for different AI models.
 * Prices are in USD per 1000 tokens.
 */

export interface ModelPricing {
  inputTokenPrice: number;  // Price per 1000 input tokens
  outputTokenPrice: number; // Price per 1000 output tokens
}

export const AI_MODEL_PRICING: Record<string, ModelPricing> = {
  // Azure OpenAI GPT-4 pricing (as of 2024)
  'gpt-4': {
    inputTokenPrice: 0.03,
    outputTokenPrice: 0.06
  },
  'gpt-4-32k': {
    inputTokenPrice: 0.06,
    outputTokenPrice: 0.12
  },
  'gpt-4-turbo': {
    inputTokenPrice: 0.01,
    outputTokenPrice: 0.03
  },
  'gpt-4o': {
    inputTokenPrice: 0.005,
    outputTokenPrice: 0.015
  },
  'gpt-4o-mini': {
    inputTokenPrice: 0.00015,
    outputTokenPrice: 0.0006
  },
  // OpenAI GPT-3.5 pricing
  'gpt-3.5-turbo': {
    inputTokenPrice: 0.0015,
    outputTokenPrice: 0.002
  },
  'gpt-3.5-turbo-16k': {
    inputTokenPrice: 0.003,
    outputTokenPrice: 0.004
  },
  // Default fallback pricing
  'default': {
    inputTokenPrice: 0.01,
    outputTokenPrice: 0.03
  }
};

/**
 * Get pricing for a specific model
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (AI_MODEL_PRICING[model]) {
    return AI_MODEL_PRICING[model];
  }
  
  // Try partial matches for Azure deployment names
  for (const [key, pricing] of Object.entries(AI_MODEL_PRICING)) {
    if (model.toLowerCase().includes(key.toLowerCase())) {
      return pricing;
    }
  }
  
  // Return default pricing if no match found
  return AI_MODEL_PRICING.default;
}

/**
 * Calculate cost for token usage
 */
export function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = getModelPricing(model);
  
  const inputCost = (inputTokens / 1000) * pricing.inputTokenPrice;
  const outputCost = (outputTokens / 1000) * pricing.outputTokenPrice;
  const totalCost = inputCost + outputCost;
  
  return {
    inputCost: Math.round(inputCost * 10000) / 10000, // Round to 4 decimal places
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000
  };
}