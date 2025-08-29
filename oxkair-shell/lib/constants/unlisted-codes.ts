/**
 * Unlisted CPT codes that can be used as candidate codes when no specific CPT code is found
 * These codes are extracted from the unlistedCodes.txt file and represent unlisted procedure codes
 * across different medical specialties and CPT sections.
 */

export const UNLISTED_CPT_CODES = [
  "60659", "37501", "95199", "01999", "90899", "90749", "99600", "77299", "67299", "39499",
  "44238", "87999", "21089", "86486", "58578", "99499", "44799", "27599", "69399", "45999",
  "43289", "97039", "58579", "47399", "42699", "37799", "53899", "21499", "43499", "68399",
  "78399", "31899", "21899", "88749", "28899", "86999", "96999", "97799", "78799", "45399",
  "79999", "38129", "88099", "42299", "46999", "50549", "50949", "41899", "24999", "81099",
  "77499", "84999", "89240", "76498", "23929", "76499", "Q4050", "91299", "94799", "59899",
  "85999", "95999", "92499", "21299", "31299", "78999", "69799", "88299", "78599", "47999",
  "22899", "26989", "25999", "40899", "78099", "27899", "42999", "30999", "55899", "20999",
  "76496", "54699", "58679", "29999", "96549", "90999", "99429", "67399", "39599", "77399",
  "64999", "47579", "29799", "69979", "81599", "31599", "43999", "44899", "78299", "59897",
  "76497", "19499", "97139", "48999", "58999", "47379", "67999", "15999", "44979", "67599",
  "90399", "41599", "33999", "51999", "40799", "78699", "81479", "88199", "27299", "22999",
  "32999", "89398", "92700", "43659", "88399", "69949", "68899", "78499", "36299", "99199",
  "49999", "38589", "93799", "66999", "77799", "60699"
] as const;

export type UnlistedCptCode = typeof UNLISTED_CPT_CODES[number];

/**
 * Checks if a given CPT code is an unlisted code
 */
export function isUnlistedCode(code: string): code is UnlistedCptCode {
  return UNLISTED_CPT_CODES.includes(code as UnlistedCptCode);
}

/**
 * Gets unlisted codes within a specific range
 */
export function getUnlistedCodesInRange(startCode: number, endCode: number): string[] {
  return UNLISTED_CPT_CODES.filter(code => {
    const codeNum = parseInt(code);
    return codeNum >= startCode && codeNum <= endCode;
  });
}