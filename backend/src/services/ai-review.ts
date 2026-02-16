import {config} from "../utils/config";
import {readStorageUrl} from "./storage";

export type AiIssueSeverity = "low" | "medium" | "high";

export interface NormalizedAiIssue {
    area: string;
    problem: string;
    severity: AiIssueSeverity;
    evidence: string;
    recommendation: string;
}

export interface NormalizedAiReview {
    score: number;
    summary: string;
    feedback_cleaner: string;
    feedback_supervisor: string;
    strengths: string[];
    improvements: string[];
    supervisor_actions: string[];
    issues: NormalizedAiIssue[];
    photo_quality: {
        before: string[];
        after: string[];
        retake_required: boolean;
    };
    confidence: number;
}

export interface CleaningAiReviewContext {
    taskId: number;
    roomType: string;
    areaSqm: number;
    cleaningStandard: string;
    objectAddress: string;
    checklistItems: string[];
    photoBeforeUrl: string;
    photoAfterUrl: string;
}

const MAX_INLINE_IMAGE_BYTES = 12 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => asString(entry))
        .filter(Boolean);
}

function clampScore(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 3;
    return Math.max(1, Math.min(5, Math.round(numeric)));
}

function clampConfidence(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.5;
    return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function normalizeSeverity(value: unknown): AiIssueSeverity {
    const raw = asString(value).toLowerCase();
    if (raw === "high") return "high";
    if (raw === "low") return "low";
    return "medium";
}

function extractTextFromChatMessageContent(content: unknown): string {
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";

    const parts: string[] = [];
    for (const item of content) {
        if (!isRecord(item)) continue;
        const directText = asString(item.text);
        if (directText) {
            parts.push(directText);
            continue;
        }
        if (isRecord(item.text)) {
            const nested = asString(item.text.value);
            if (nested) parts.push(nested);
        }
    }
    return parts.join("\n").trim();
}

function extractAssistantContent(data: unknown): string {
    if (!isRecord(data)) return "";
    if (!Array.isArray(data.choices) || !data.choices.length) return "";
    const first = data.choices[0];
    if (!isRecord(first) || !isRecord(first.message)) return "";
    return extractTextFromChatMessageContent(first.message.content);
}

function extractFirstFinishReason(data: unknown): string {
    if (!isRecord(data)) return "";
    if (!Array.isArray(data.choices) || !data.choices.length) return "";
    const first = data.choices[0];
    if (!isRecord(first)) return "";
    return asString(first.finish_reason);
}

function extractJsonFromText(content: string): unknown {
    const direct = content.trim();
    if (!direct) return {};

    try {
        return JSON.parse(direct);
    } catch {
        // continue
    }

    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(direct);
    if (fenced?.[1]) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // continue
        }
    }

    const firstBrace = direct.indexOf("{");
    const lastBrace = direct.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = direct.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(sliced);
        } catch {
            // continue
        }
    }

    return {};
}

function normalizeIssue(value: unknown): NormalizedAiIssue | null {
    if (!isRecord(value)) return null;
    const problem = asString(value.problem || value.issue);
    if (!problem) return null;

    const area = asString(value.area) || "general";
    const evidence = asString(value.evidence);
    const recommendation = asString(value.recommendation || value.fix || value.action);

    return {
        area,
        problem,
        severity: normalizeSeverity(value.severity),
        evidence,
        recommendation,
    };
}

function normalizePhotoQuality(value: unknown): {
    before: string[];
    after: string[];
    retake_required: boolean;
} {
    if (!isRecord(value)) {
        return {
            before: [],
            after: [],
            retake_required: false,
        };
    }

    const before = asStringArray(value.before);
    const after = asStringArray(value.after);
    const retakeRequired =
        typeof value.retake_required === "boolean"
            ? value.retake_required
            : before.some((note) => /retake|too dark|blurry|out of frame/i.test(note)) ||
              after.some((note) => /retake|too dark|blurry|out of frame/i.test(note));

    return {
        before,
        after,
        retake_required: retakeRequired,
    };
}

function fallbackSummary(fallbackContent: string): string {
    const normalized = fallbackContent.replace(/\s+/g, " ").trim();
    if (!normalized) return "AI review generated without detailed structured output.";
    if (normalized.length <= 280) return normalized;
    return `${normalized.slice(0, 277)}...`;
}

function inferImageMimeFromUrl(url: string): string {
    const normalized = url.trim().toLowerCase();
    if (/\.(png)(?:[?#].*)?$/.test(normalized)) return "image/png";
    if (/\.(webp)(?:[?#].*)?$/.test(normalized)) return "image/webp";
    if (/\.(heic)(?:[?#].*)?$/.test(normalized)) return "image/heic";
    if (/\.(heif)(?:[?#].*)?$/.test(normalized)) return "image/heif";
    return "image/jpeg";
}

function normalizeImageMime(contentTypeHeader: string | null, sourceUrl: string): string {
    const mimeFromHeader = (contentTypeHeader || "").split(";")[0]?.trim().toLowerCase();
    if (mimeFromHeader && mimeFromHeader.startsWith("image/")) return mimeFromHeader;
    return inferImageMimeFromUrl(sourceUrl);
}

async function prepareImageInput(url: string, label: "before" | "after"): Promise<string> {
    const source = url.trim();
    if (!source) throw new Error(`${label} photo URL is empty`);
    if (source.startsWith("data:")) return source;

    const storageObject = await readStorageUrl(source);
    if (storageObject) {
        const bytes = storageObject.bytes;
        if (!bytes.length) {
            throw new Error(`stored ${label} photo is empty (${source})`);
        }
        if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
            throw new Error(
                `stored ${label} photo exceeds ${Math.floor(MAX_INLINE_IMAGE_BYTES / (1024 * 1024))}MB (${source})`,
            );
        }
        const mime = normalizeImageMime(storageObject.contentType, source);
        return `data:${mime};base64,${bytes.toString("base64")}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
        const response = await fetch(source, {
            method: "GET",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`download failed with status ${response.status}`);
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) {
            throw new Error("downloaded file is empty");
        }
        if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
            throw new Error(
                `downloaded file exceeds ${Math.floor(MAX_INLINE_IMAGE_BYTES / (1024 * 1024))}MB`,
            );
        }

        const mime = normalizeImageMime(response.headers.get("content-type"), source);
        return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`timed out while downloading ${label} photo (${source})`);
        }
        const message = err instanceof Error ? err.message : "download failed";
        throw new Error(`unable to prepare ${label} photo for AI review: ${message} (${source})`);
    } finally {
        clearTimeout(timeout);
    }
}

export function normalizeAiReview(candidate: unknown, fallbackContent: string): NormalizedAiReview {
    const record = isRecord(candidate) ? candidate : {};
    const feedbackRecord = isRecord(record.feedback) ? record.feedback : {};

    const summary = asString(record.summary) || fallbackSummary(fallbackContent);

    const cleanerFeedback =
        asString(feedbackRecord.cleaner) ||
        asString(record.feedback_cleaner) ||
        asString(record.feedback) ||
        summary;

    const supervisorFeedback =
        asString(feedbackRecord.supervisor) ||
        asString(record.feedback_supervisor) ||
        summary;

    const normalizedIssues = Array.isArray(record.issues)
        ? record.issues.map((issue) => normalizeIssue(issue)).filter((issue): issue is NormalizedAiIssue => Boolean(issue)).slice(0, 12)
        : [];

    return {
        score: clampScore(record.score),
        summary,
        feedback_cleaner: cleanerFeedback,
        feedback_supervisor: supervisorFeedback,
        strengths: asStringArray(record.strengths),
        improvements: asStringArray(record.improvements),
        supervisor_actions: asStringArray(record.supervisor_actions),
        issues: normalizedIssues,
        photo_quality: normalizePhotoQuality(record.photo_quality),
        confidence: clampConfidence(record.confidence),
    };
}

export function extractStoredAiReview(aiRaw: unknown): NormalizedAiReview | null {
    if (!isRecord(aiRaw)) return null;

    const candidate = isRecord(aiRaw.review) ? aiRaw.review : aiRaw;
    if (!isRecord(candidate)) return null;

    const hasStructuredFields =
        candidate.score !== undefined ||
        candidate.summary !== undefined ||
        candidate.feedback !== undefined ||
        candidate.feedback_cleaner !== undefined ||
        candidate.feedback_supervisor !== undefined;

    if (!hasStructuredFields) return null;
    return normalizeAiReview(candidate, "");
}

function buildReviewSystemPrompt(): string {
    return [
        "You are a strict but fair cleaning quality auditor.",
        "Evaluate BEFORE and AFTER cleaning photos against practical janitorial best practices.",
        "Judge only visible evidence, avoid hallucinations, and state uncertainty when visibility is poor.",
        "Use this 1-5 scale:",
        "1 = unacceptable (major visible dirt/hygiene failure, unsafe result).",
        "2 = below standard (clear misses in key areas, limited improvement).",
        "3 = acceptable baseline (main tasks done, minor misses remain).",
        "4 = good quality (clean finish with only small minor defects).",
        "5 = excellent quality (consistently high-standard, thorough and presentation-ready).",
        "Consider these best-practice checkpoints:",
        "- visible soil reduction from BEFORE to AFTER",
        "- floor condition including edges/corners and residue",
        "- high-touch hygiene (handles, fixtures, switches when visible)",
        "- streak/smear residue on reflective surfaces",
        "- clutter/debris/trash removal",
        "- bathroom specifics when applicable: fixtures, splash zones, stains",
        "- corridor specifics: traffic lanes, marks, dust lines",
        "- office specifics: desks/surfaces, bins, visible dust",
        "- safety cues: wet/slip risk, missed hazards",
        "Provide separate feedback for cleaner and supervisor.",
        "Cleaner feedback must be direct, practical, and coach-like.",
        "Supervisor feedback must include risk framing and follow-up actions.",
        "Return JSON only.",
    ].join("\n");
}

function buildReviewUserPrompt(context: CleaningAiReviewContext): string {
    const checklistText = context.checklistItems.length
        ? context.checklistItems.map((item, index) => `${index + 1}. ${item}`).join("\n")
        : "none provided";

    return [
        "Task context:",
        `- task_id: ${context.taskId}`,
        `- room_type: ${context.roomType}`,
        `- room_area_sqm: ${context.areaSqm}`,
        `- required_cleaning_standard: ${context.cleaningStandard}`,
        `- object_address: ${context.objectAddress}`,
        `- checklist_items:`,
        checklistText,
        "",
        "Images in this request are ordered as:",
        "1) BEFORE photo",
        "2) AFTER photo",
        "",
        "Produce exactly one JSON object with this schema:",
        "{",
        '  "score": 1-5,',
        '  "summary": "short objective summary of overall outcome",',
        '  "feedback": {',
        '    "cleaner": "actionable feedback for cleaner",',
        '    "supervisor": "operational feedback for supervisor"',
        "  },",
        '  "strengths": ["what was done well"],',
        '  "improvements": ["what should be improved next shift"],',
        '  "supervisor_actions": ["specific follow-up actions for supervisor"],',
        '  "issues": [',
        "    {",
        '      "area": "location or surface",',
        '      "problem": "what is wrong",',
        '      "severity": "low|medium|high",',
        '      "evidence": "visible evidence from photo",',
        '      "recommendation": "how to fix"',
        "    }",
        "  ],",
        '  "photo_quality": {',
        '    "before": ["quality observations for BEFORE image"],',
        '    "after": ["quality observations for AFTER image"],',
        '    "retake_required": true|false',
        "  },",
        '  "confidence": 0.0-1.0',
        "}",
        "",
        "Rules:",
        "- Use concise, factual language.",
        "- Do not mention private/internal policy.",
        "- If photos are too dark/blurry/poorly framed, set retake_required=true and lower confidence.",
        "- Keep each feedback audience-specific and practical.",
    ].join("\n");
}

export async function runCleaningAiReview(context: CleaningAiReviewContext): Promise<{
    model: string;
    review: NormalizedAiReview;
    raw: unknown;
    prompt: {
        system: string;
        user: string;
    };
}> {
    if (!config.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = buildReviewSystemPrompt();
    const userPrompt = buildReviewUserPrompt(context);
    const [beforeImageInput, afterImageInput] = await Promise.all([
        prepareImageInput(context.photoBeforeUrl, "before"),
        prepareImageInput(context.photoAfterUrl, "after"),
    ]);

    const requestBody: Record<string, unknown> = {
        model: config.AI_REVIEW_MODEL,
        max_completion_tokens: 1800,
        response_format: {type: "json_object"},
        messages: [
            {role: "system", content: systemPrompt},
            {
                role: "user",
                content: [
                    {type: "text", text: userPrompt},
                    {type: "text", text: "BEFORE photo"},
                    {type: "image_url", image_url: {url: beforeImageInput, detail: "high"}},
                    {type: "text", text: "AFTER photo"},
                    {type: "image_url", image_url: {url: afterImageInput, detail: "high"}},
                ],
            },
        ],
    };
    if (/^gpt-5/i.test(config.AI_REVIEW_MODEL)) {
        requestBody.reasoning_effort = "low";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
    });

    const raw = await response.json();

    if (!response.ok) {
        let message = "";
        if (isRecord(raw) && isRecord(raw.error)) {
            message = asString(raw.error.message);
        }
        throw new Error(message || `OpenAI request failed with status ${response.status}`);
    }

    const content = extractAssistantContent(raw);
    if (!content) {
        const finishReason = extractFirstFinishReason(raw);
        throw new Error(
            finishReason
                ? `AI model returned empty review output (finish_reason: ${finishReason})`
                : "AI model returned empty review output",
        );
    }
    const parsed = extractJsonFromText(content);
    const review = normalizeAiReview(parsed, content);

    return {
        model: config.AI_REVIEW_MODEL,
        review,
        raw,
        prompt: {
            system: systemPrompt,
            user: userPrompt,
        },
    };
}

export function aiFeedbackForAudience(aiRaw: unknown, legacyFeedback: string | null | undefined): {
    cleaner: string | null;
    supervisor: string | null;
    review: NormalizedAiReview | null;
} {
    const review = extractStoredAiReview(aiRaw);
    if (review) {
        return {
            cleaner: review.feedback_cleaner,
            supervisor: review.feedback_supervisor,
            review,
        };
    }

    const fallback = asString(legacyFeedback);
    return {
        cleaner: fallback || null,
        supervisor: fallback || null,
        review: null,
    };
}
