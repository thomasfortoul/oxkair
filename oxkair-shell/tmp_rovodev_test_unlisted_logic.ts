// Test script to understand unlisted code logic
import { UNLISTED_CPT_CODES } from "./lib/constants/unlisted-codes.ts";

// Function to find closest unlisted codes above and below a given code
function findClosestUnlistedCodes(candidateCode: string): { above: string | null, below: string | null } {
  const candidateNum = parseInt(candidateCode);
  const unlistedNumbers = UNLISTED_CPT_CODES.map(code => parseInt(code)).sort((a, b) => a - b);
  
  let above: string | null = null;
  let below: string | null = null;
  
  // Find closest above
  for (const unlistedNum of unlistedNumbers) {
    if (unlistedNum > candidateNum) {
      above = unlistedNum.toString().padStart(5, '0');
      break;
    }
  }
  
  // Find closest below
  for (let i = unlistedNumbers.length - 1; i >= 0; i--) {
    const unlistedNum = unlistedNumbers[i];
    if (unlistedNum < candidateNum) {
      below = unlistedNum.toString().padStart(5, '0');
      break;
    }
  }
  
  return { above, below };
}

// Test with some examples
console.log("Testing unlisted code logic:");
console.log("45762:", findClosestUnlistedCodes("45762"));
console.log("44238:", findClosestUnlistedCodes("44238"));
console.log("21089:", findClosestUnlistedCodes("21089"));

// Show all unlisted codes sorted
console.log("\nAll unlisted codes sorted:");
const sorted = UNLISTED_CPT_CODES.map(code => parseInt(code)).sort((a, b) => a - b);
console.log(sorted.map(n => n.toString().padStart(5, '0')));