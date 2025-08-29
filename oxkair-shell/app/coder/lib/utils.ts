import {
  WorkflowLogger,
  logFunctionExecution,
  logParameterValidation,
} from "./logging";

function safeJsonParseFn(
  logger: WorkflowLogger,
  text: unknown,
  contextLabel: unknown = "AI Response"
) {
  if (typeof text !== "string") {
    throw new TypeError("safeJsonParse expects the first argument to be a string.");
  }
  if (typeof contextLabel !== "string") {
    throw new TypeError(
      "safeJsonParse expects the second argument to be a string."
    );
  }

  logParameterValidation(
    logger,
    "safeJsonParse",
    "text",
    "isNonEmptyString",
    typeof text === "string" && text.length > 0
  );
  logParameterValidation(
    logger,
    "safeJsonParse",
    "contextLabel",
    "isNonEmptyString",
    typeof contextLabel === "string" && contextLabel.length > 0
  );

  try {
    // Attempt to find the start of a JSON object or array
    const jsonStartIndex = text.search(/[[{]/);
    if (jsonStartIndex === -1) {
      logger.logWarn(
        "safeJsonParseFn",
        `No JSON object/array found in ${contextLabel}`,
        {
          text,
          contextLabel,
        }
      );
      throw new Error(
        `No JSON object or array found in the AI response for ${contextLabel}.`
      );
    }

    // Attempt to find the end of the JSON object or array
    // This is a bit tricky, we'll use balancing braces/brackets
    let openBraces = 0;
    let openBrackets = 0;
    let jsonEndIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = jsonStartIndex; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === "\\") {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      switch (char) {
        case "{":
          openBraces++;
          break;
        case "}":
          openBraces--;
          break;
        case "[":
          openBrackets++;
          break;
        case "]":
          openBrackets--;
          break;
      }

      if (openBraces === 0 && openBrackets === 0) {
        jsonEndIndex = i + 1;
        break;
      }
    }

    if (jsonEndIndex === -1) {
      logger.logWarn(
        "safeJsonParseFn",
        `Could not find end of JSON in ${contextLabel}`,
        {
          text,
          contextLabel,
        }
      );
      throw new Error(
        `Could not determine the end of the JSON structure for ${contextLabel}.`
      );
    }

    const jsonString = text.substring(jsonStartIndex, jsonEndIndex);
    logger.logTrace(
      "safeJsonParseFn",
      `Extracted JSON string for ${contextLabel}`,
      {
        jsonString,
        contextLabel,
        originalLength: text.length,
        extractedLength: jsonString.length,
      }
    );

    const parsedJson = JSON.parse(jsonString);
    logger.logTrace(
      "safeJsonParseFn",
      `Successfully parsed JSON for ${contextLabel}`,
      {
        contextLabel,
      }
    );
    return parsedJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.logError("safeJsonParseFn", `JSON parsing failed for ${contextLabel}`, {
      error: message,
      text,
      contextLabel,
    });
    // It's better to throw a more specific error to be caught by the calling function
    throw new Error(
      `Failed to parse JSON from AI response for ${contextLabel}: ${message}`
    );
  }
}

export const safeJsonParse = logFunctionExecution(safeJsonParseFn, 'safeJsonParse');