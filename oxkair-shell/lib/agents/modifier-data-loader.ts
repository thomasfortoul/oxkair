/**
 * Utility functions for loading and processing pre-vetted modifier data
 */

import modifierListData from "../../app/coder/lib/modifier-list.json";

export interface ModifierInfo {
  description: string;
  phrases: string[];
  note?: string;
  guidance: string;
}

export interface PreVettedModifier {
  code: string;
  info: ModifierInfo;
}

/**
 * Pre-vetted modifiers that are allowed to be used by the AI
 * These are the modifiers that have detailed descriptions and guidance in our modifier list JSON
 */
const PRE_VETTED_MODIFIERS = new Set([
  '22', '23', '24', '25', '26', '27', '32', '33', '47', '50', 
  '51', '52', '53', '54', '55', '56', '57', '58', '59', '62', 
  '63', '66', '73', '74', '76', '77', '78', '79', '80', '81', 
  '82', '90', '91', '92', '93', '95', '96', '97', '99', 'P1', 
  'P2', 'P3', 'P4', 'P5', 'P6'
]);

/**
 * Loads modifier data from the JSON file and converts to a map
 */
function loadModifierData(): Map<string, ModifierInfo> {
  const modifierMap = new Map<string, ModifierInfo>();
  
  // The JSON file is an array of objects, each with a single modifier key
  for (const item of modifierListData) {
    const modifierCode = Object.keys(item)[0];
    const modifierInfo = item[modifierCode as keyof typeof item] as ModifierInfo;
    modifierMap.set(modifierCode, modifierInfo);
  }
  
  return modifierMap;
}

/**
 * Gets the pre-vetted modifiers that are available for use
 */
export function getPreVettedModifiers(): Set<string> {
  return new Set(PRE_VETTED_MODIFIERS);
}

/**
 * Filters a list of modifiers to only include those that are:
 * 1. In the procedure's allowed modifiers list
 * 2. In the pre-vetted modifiers list
 * 3. Have data available in the modifier list JSON
 */
export function filterAllowedModifiers(
  procedureAllowedModifiers: string[],
  phase?: "phase1" | "phase2"
): PreVettedModifier[] {
  const modifierData = loadModifierData();
  const preVettedSet = getPreVettedModifiers();
  
  // Define compliance-related modifiers (Phase 1)
  const complianceModifiers = new Set([
    "59", "XE", "XS", "XP", "XU", // Distinct service modifiers
    "25", "57", "24", "58", "78", "79" // E/M and global period modifiers
  ]);
  
  return procedureAllowedModifiers
    .filter(modifier => {
      // Must be in pre-vetted list
      if (!preVettedSet.has(modifier)) {
        return false;
      }
      
      // Must have data available
      if (!modifierData.has(modifier)) {
        return false;
      }
      
      // Phase filtering
      if (phase === "phase1") {
        return complianceModifiers.has(modifier);
      } else if (phase === "phase2") {
        return !complianceModifiers.has(modifier);
      }
      
      // No phase specified, include all
      return true;
    })
    .map(modifier => ({
      code: modifier,
      info: modifierData.get(modifier)!
    }));
}

/**
 * Formats modifier information for use in AI prompts
 */
export function formatModifierForPrompt(modifier: PreVettedModifier): string {
  const { code, info } = modifier;
  let formatted = `${code}: ${info.description}`;
  
  if (info.note) {
    formatted += `\n(note: ${info.note})`;
  }
  
  if (info.phrases && info.phrases.length > 0) {
    formatted += `\nLook out for phrases such as: ${info.phrases.join(", ")}`;
  }
  
  return formatted;
}

/**
 * Gets modifier information by code
 */
export function getModifierInfo(modifierCode: string): ModifierInfo | null {
  const modifierData = loadModifierData();
  return modifierData.get(modifierCode) || null;
}