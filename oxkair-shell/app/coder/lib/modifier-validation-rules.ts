export const MODIFIER_VALIDATION_RULES = {
  CONFLICTING_PAIRS: [
    // Anatomical location conflicts
    ["RT", "LT"],
    ["RT", "50"],
    ["LT", "50"],
    ["E1", "E3"],
    ["E2", "E4"],
    ["FA", "F5"],
    ["TA", "T5"],
    // Service type conflicts
    ["26", "TC"],
    ["52", "53"],
    ["54", "55"],
    ["54", "56"],
    ["55", "56"],
    // Assistant surgeon conflicts
    ["80", "81"],
    ["80", "82"],
    ["81", "82"],
    ["80", "AS"],
    ["81", "AS"],
    ["82", "AS"],
    // Surgeon role conflicts
    ["62", "66"],
    ["62", "80"],
    ["62", "81"],
    ["62", "82"],
    ["66", "80"],
    ["66", "81"],
    ["66", "82"],
    // Repeat procedure conflicts
    ["76", "77"],
    // Global period conflicts
    ["58", "78"],
    ["58", "79"],
    ["78", "79"],
    // NCCI edit bypass conflicts
    ["59", "XE"],
    ["59", "XP"],
    ["59", "XS"],
    ["59", "XU"],
    ["XE", "XP"],
    ["XE", "XS"],
    ["XE", "XU"],
    ["XP", "XS"],
    ["XP", "XU"],
    ["XS", "XU"],
    // Telehealth conflicts
    ["95", "GT"],
    // E/M conflicts
    ["24", "25"],
    // ABN conflicts
    ["GX", "GZ"],
  ],
  SEQUENCE_RULES: {
    DEFAULT_ORDER: ["PRICING", "PAYMENT", "LOCATION", "INFORMATIONAL"],
    SPECIAL_SEQUENCES: {
      "62-51": ["62", "51"],
      "22-63": ["22", "63"],
      "50-LT": ["50"],
      "50-RT": ["50"],
      "80-AS": ["80"],
      "59-XE": ["XE"],
      "59-XP": ["XP"],
      "59-XS": ["XS"],
      "59-XU": ["XU"],
    },
  },
  CATEGORIES: {
    PRICING: ["22", "26", "50", "52", "53", "54", "55", "56", "62", "63", "66", "80", "81", "82", "TC"],
    PAYMENT: ["25", "51", "57", "58", "59", "76", "77", "78", "79", "XE", "XP", "XS", "XU", "91"],
    LOCATION: ["RT", "LT", "E1", "E2", "E3", "E4", "FA", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "TA", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "LC", "LD", "RC", "LM", "RI"],
    INFORMATIONAL: ["GC", "GW", "GV", "GX", "GY", "GZ", "JW", "KX", "QW", "XTS", "33", "95", "GT"],
  },
  ADD_ON_EXEMPT_MODIFIERS: ["51", "50"],
  UNLISTED_ALLOWED_MODIFIERS: ["62", "82", "80", "81", "AS", "59", "XE", "XP", "XS", "XU", "RT", "LT"],
  FEE_ADJUSTMENTS: {
    "50": "150% of base rate",
    "62": "62.5% of base rate (each surgeon)",
    "63": "125% of base rate",
    "GC": "No fee adjustment (documentation only)",
  },
} as const

export type ModifierValidationRules = typeof MODIFIER_VALIDATION_RULES
