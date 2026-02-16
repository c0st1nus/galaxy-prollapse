import OpenAI from "openai";
import {config} from "../utils/config";

export type AiRatingMode = "auto" | "primary" | "escalation" | "override";

export interface AiRatingRequest {
  photoBefore?: string | null;
  photoAfter?: string | null;
  roomType: string;
  cleaningStandard: string;
  mode?: AiRatingMode;
}

export interface AiRatingResult {
  score: number;
  feedback: string;
  issues: string[];
  confidence: number;
  model: string;
  escalated: boolean;
  usage: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

const openaiClient = config.OPENAI_API_KEY
  ? new OpenAI({apiKey: config.OPENAI_API_KEY})
  : null;

const outputSchema = {
  type: "object",
  properties: {
    score: {type: "integer", minimum: 1, maximum: 5},
    feedback: {type: "string"},
    issues: {
      type: "array",
      items: {type: "string"},
      maxItems: 8,
    },
    confidence: {type: "number", minimum: 0, maximum: 1},
  },
  required: ["score", "feedback", "issues", "confidence"],
  additionalProperties: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return clamp(numberValue, 0, 1);
}

function normalizeScore(value: unknown): number {
  const score = Math.round(Number(value));
  if (!Number.isFinite(score)) {
    return 1;
  }
  return clamp(score, 1, 5);
}

function normalizeIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const outputs = Array.isArray(response?.output) ? response.output : [];
  for (const output of outputs) {
    const content = Array.isArray(output?.content) ? output.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        return part.text;
      }
    }
  }

  throw new Error("AI response did not include output text");
}

function parseRating(text: string) {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    score: normalizeScore(parsed.score),
    feedback: typeof parsed.feedback === "string" ? parsed.feedback.trim() : "No feedback provided",
    issues: normalizeIssues(parsed.issues),
    confidence: normalizeConfidence(parsed.confidence),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(() => reject(new Error("AI request timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}

function buildPrompt(request: AiRatingRequest) {
  const prompt = [
    "You are rating a cleaning task quality from evidence photos.",
    `Room type: ${request.roomType}.`,
    `Cleaning standard: ${request.cleaningStandard}.`,
    "Compare before/after evidence and rate cleaning result from 1 (poor) to 5 (excellent).",
    "Be strict and focus on hygiene, visible debris, and completion quality.",
    "Return JSON only.",
  ].join(" ");

  const content: Record<string, unknown>[] = [
    {type: "input_text", text: prompt},
  ];

  if (request.photoBefore) {
    content.push({
      type: "input_text",
      text: "before photo:",
    });
    content.push({
      type: "input_image",
      image_url: request.photoBefore,
    });
  }

  if (request.photoAfter) {
    content.push({
      type: "input_text",
      text: "after photo:",
    });
    content.push({
      type: "input_image",
      image_url: request.photoAfter,
    });
  }

  return content;
}

function selectModelForMode(mode: AiRatingMode): string {
  if (mode === "escalation") {
    return config.OPENAI_MODEL_ESCALATION;
  }
  if (mode === "override") {
    return config.OPENAI_MODEL_MANUAL_OVERRIDE;
  }
  return config.OPENAI_MODEL_PRIMARY;
}

async function requestModelRating(model: string, request: AiRatingRequest) {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const body: any = {
    model,
    input: [
      {
        role: "user",
        content: buildPrompt(request),
      },
    ],
    reasoning: {effort: "low"},
    text: {
      format: {
        type: "json_schema",
        name: "cleaning_quality_rating",
        strict: true,
        schema: outputSchema,
      },
    },
  };

  const response: any = await withTimeout(
    openaiClient.responses.create(body),
    config.OPENAI_TIMEOUT_MS,
  );

  const outputText = extractOutputText(response);
  const parsed = parseRating(outputText);
  const usage = (response?.usage ?? null) as Record<string, unknown> | null;

  return {
    ...parsed,
    model,
    usage,
    raw: {
      response_id: response?.id ?? null,
      model: response?.model ?? model,
      usage,
      output_text: outputText,
    },
  };
}

export function isAiRatingEnabled(): boolean {
  return Boolean(openaiClient);
}

export async function rateCleaningTask(request: AiRatingRequest): Promise<AiRatingResult> {
  if (!request.photoBefore && !request.photoAfter) {
    throw new Error("No photo evidence provided for AI rating");
  }

  const mode = request.mode ?? "auto";
  if (mode !== "auto") {
    const model = selectModelForMode(mode);
    const result = await requestModelRating(model, request);
    return {
      ...result,
      escalated: mode === "escalation" || mode === "override",
    };
  }

  const primaryModel = selectModelForMode("primary");
  const primaryResult = await requestModelRating(primaryModel, request);

  if (primaryResult.confidence >= config.OPENAI_MIN_CONFIDENCE) {
    return {
      ...primaryResult,
      escalated: false,
    };
  }

  // escalate low-confidence ratings to mini for better quality while staying cost-aware.
  const escalationModel = selectModelForMode("escalation");
  if (!escalationModel || escalationModel === primaryModel) {
    return {
      ...primaryResult,
      escalated: false,
    };
  }

  const escalatedResult = await requestModelRating(escalationModel, request);
  return {
    ...escalatedResult,
    escalated: true,
  };
}
