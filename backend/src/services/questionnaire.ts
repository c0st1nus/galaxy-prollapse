// adaptive questionnaire engine with practical 5-level cleaning profiles.
// questions assess current condition and requirements to auto-determine the level,
// then generate a full checklist appropriate for that level and room type.
//
// Internal levels (mapped to appa_1..appa_5 for existing API/storage compat):
//   1 – premium presentation clean (highest daily standard)
//   2 – high hygiene daily clean
//   3 – standard daily clean
//   4 – basic maintenance clean
//   5 – recovery deep clean (lowest baseline / needs most work)

export interface QuestionOption {
    value: string;
    label: string;
}

export interface Question {
    id: string;
    text: string;
    type: "single" | "multi" | "boolean";
    options?: QuestionOption[];
    condition?: {
        question_id: string;
        values: string[];
    };
}

export interface QuestionnaireAnswer {
    question_id: string;
    answer: string | string[];
}

export interface ChecklistItem {
    id: string;
    title: string;
    done: boolean;
    photo_required: boolean;
    note?: string;
    appa_level?: number; // minimum APPA level that requires this item
}

// ── Question bank ──────────────────────────────────────────────────────

const baseQuestions: Question[] = [
    {
        id: "floor_condition",
        text: "What is the current floor condition?",
        type: "single",
        options: [
            { value: "spotless", label: "Spotless – no visible dirt, polished finish" },
            { value: "clean", label: "Clean – minor dust, overall tidy" },
            { value: "lightly_soiled", label: "Lightly soiled – visible dust trails, some marks" },
            { value: "dirty", label: "Dirty – stains, grime buildup, debris" },
            { value: "heavily_soiled", label: "Heavily soiled – sticky residue, heavy grime, neglected" },
        ],
    },
    {
        id: "surface_dust",
        text: "How much dust is present on horizontal surfaces (desks, ledges, shelves)?",
        type: "single",
        options: [
            { value: "none", label: "No visible dust" },
            { value: "light", label: "Light dust film" },
            { value: "moderate", label: "Clearly visible dust buildup" },
            { value: "heavy", label: "Heavy dust / cobwebs present" },
        ],
    },
    {
        id: "trash_status",
        text: "What is the trash/waste bin status?",
        type: "single",
        options: [
            { value: "empty", label: "Empty or nearly empty" },
            { value: "partially_full", label: "Partially full, liner intact" },
            { value: "full", label: "Full, needs replacement" },
            { value: "overflowing", label: "Overflowing / scattered waste" },
        ],
    },
    {
        id: "odor",
        text: "Are there any noticeable odors?",
        type: "single",
        options: [
            { value: "none", label: "No odors – fresh" },
            { value: "slight", label: "Slight stale smell" },
            { value: "noticeable", label: "Noticeable unpleasant odor" },
            { value: "strong", label: "Strong offensive odor" },
        ],
    },
    {
        id: "wall_condition",
        text: "What is the condition of walls and baseboards?",
        type: "single",
        options: [
            { value: "clean", label: "Clean – no marks or scuffs" },
            { value: "minor_marks", label: "Minor scuff marks" },
            { value: "stained", label: "Visible stains or handprints" },
            { value: "neglected", label: "Heavy buildup, peeling, graffiti" },
        ],
    },
    {
        id: "windows_glass",
        text: "What is the condition of windows and glass surfaces?",
        type: "single",
        options: [
            { value: "spotless", label: "Crystal clear, no smudges" },
            { value: "minor_smudges", label: "Minor fingerprints or smudges" },
            { value: "dirty", label: "Visibly dirty, water spots" },
            { value: "very_dirty", label: "Heavily soiled, obscured view" },
        ],
    },
    {
        id: "high_traffic",
        text: "Is this a high-traffic area?",
        type: "boolean",
    },
    {
        id: "special_requirements",
        text: "Are there special cleaning requirements?",
        type: "multi",
        options: [
            { value: "disinfection", label: "Disinfection required" },
            { value: "allergen_control", label: "Allergen control / HEPA needed" },
            { value: "antistatic", label: "Anti-static treatment" },
            { value: "eco_products", label: "Eco-friendly products only" },
            { value: "biohazard", label: "Biohazard / bodily fluids present" },
            { value: "none", label: "None" },
        ],
    },
    // follow-up for heavy soil
    {
        id: "heavy_equipment_available",
        text: "Is heavy-duty cleaning equipment available (scrubber, extractor)?",
        type: "boolean",
        condition: { question_id: "floor_condition", values: ["dirty", "heavily_soiled"] },
    },
    // follow-up for odor
    {
        id: "odor_source",
        text: "Can you identify the odor source?",
        type: "single",
        options: [
            { value: "waste", label: "Waste / garbage" },
            { value: "mold", label: "Mold / mildew" },
            { value: "drain", label: "Drain / plumbing" },
            { value: "food", label: "Food residue" },
            { value: "unknown", label: "Unknown" },
        ],
        condition: { question_id: "odor", values: ["noticeable", "strong"] },
    },
];

const bathroomQuestions: Question[] = [
    {
        id: "fixture_condition",
        text: "What is the condition of bathroom fixtures (toilets, urinals, sinks)?",
        type: "single",
        options: [
            { value: "sanitary", label: "Clean and sanitary" },
            { value: "needs_cleaning", label: "Needs standard cleaning" },
            { value: "soiled", label: "Soiled – stains, mineral deposits" },
            { value: "unsanitary", label: "Unsanitary – heavy buildup, health concern" },
        ],
    },
    {
        id: "supplies_stock",
        text: "Are bathroom supplies (soap, paper towels, toilet paper) stocked?",
        type: "single",
        options: [
            { value: "full", label: "Fully stocked" },
            { value: "low", label: "Running low (< 25%)" },
            { value: "empty", label: "Empty" },
        ],
    },
    {
        id: "drain_condition",
        text: "Are drains clear and functioning?",
        type: "boolean",
    },
    {
        id: "grout_condition",
        text: "What is the tile grout condition?",
        type: "single",
        options: [
            { value: "clean", label: "Clean – original color visible" },
            { value: "discolored", label: "Discolored" },
            { value: "moldy", label: "Mold/mildew in grout lines" },
        ],
    },
];

const officeQuestions: Question[] = [
    {
        id: "workstation_clutter",
        text: "How cluttered are the workstations?",
        type: "single",
        options: [
            { value: "clear", label: "Clear – minimal personal items" },
            { value: "moderate", label: "Moderate clutter" },
            { value: "heavy", label: "Heavy clutter – difficult to clean around" },
        ],
    },
    {
        id: "electronics_present",
        text: "Are there sensitive electronics that need careful cleaning around?",
        type: "boolean",
    },
    {
        id: "carpet_condition",
        text: "What is the carpet/floor covering condition?",
        type: "single",
        options: [
            { value: "clean", label: "Clean – well maintained" },
            { value: "light_stains", label: "Light spots or traffic patterns" },
            { value: "stained", label: "Visible stains, matted fibers" },
            { value: "heavily_soiled", label: "Heavily soiled, odor present" },
        ],
    },
];

const corridorQuestions: Question[] = [
    {
        id: "foot_traffic_level",
        text: "What is the current foot traffic level?",
        type: "single",
        options: [
            { value: "low", label: "Low – few people" },
            { value: "moderate", label: "Moderate" },
            { value: "high", label: "High – constant flow" },
        ],
    },
    {
        id: "floor_type",
        text: "What is the floor type?",
        type: "single",
        options: [
            { value: "hard", label: "Hard surface (tile, vinyl, concrete)" },
            { value: "carpet", label: "Carpet" },
            { value: "mixed", label: "Mixed surfaces" },
        ],
    },
    {
        id: "signage_available",
        text: "Are wet floor signs and barrier tape available?",
        type: "boolean",
    },
];

// ── Public API ─────────────────────────────────────────────────────────

export function getQuestionsForRoom(roomType: string): Question[] {
    const questions = [...baseQuestions];
    switch (roomType) {
        case "bathroom":
            questions.push(...bathroomQuestions);
            break;
        case "office":
            questions.push(...officeQuestions);
            break;
        case "corridor":
            questions.push(...corridorQuestions);
            break;
    }
    return questions;
}

export function getNextQuestions(
    roomType: string,
    currentAnswers: QuestionnaireAnswer[],
): Question[] {
    const allQuestions = getQuestionsForRoom(roomType);
    const answeredIds = new Set(currentAnswers.map((a) => a.question_id));
    const answerMap = new Map(
        currentAnswers.map((a) => [a.question_id, a.answer]),
    );

    return allQuestions.filter((q) => {
        if (answeredIds.has(q.id)) return false;
        if (q.condition) {
            const prevAnswer = answerMap.get(q.condition.question_id);
            if (!prevAnswer) return false;
            const answerValues = Array.isArray(prevAnswer) ? prevAnswer : [prevAnswer];
            if (!q.condition.values.some((v) => answerValues.includes(v))) return false;
        }
        return true;
    });
}

// ── APPA level determination ───────────────────────────────────────────

// Scoring: each answer contributes points; higher total = worse condition = higher APPA level.
// We normalise to 1-5 at the end.
const conditionScores: Record<string, Record<string, number>> = {
    floor_condition: { spotless: 0, clean: 1, lightly_soiled: 2, dirty: 3, heavily_soiled: 4 },
    surface_dust: { none: 0, light: 1, moderate: 2, heavy: 4 },
    trash_status: { empty: 0, partially_full: 1, full: 2, overflowing: 4 },
    odor: { none: 0, slight: 1, noticeable: 3, strong: 4 },
    wall_condition: { clean: 0, minor_marks: 1, stained: 2, neglected: 4 },
    windows_glass: { spotless: 0, minor_smudges: 1, dirty: 2, very_dirty: 4 },
    fixture_condition: { sanitary: 0, needs_cleaning: 1, soiled: 3, unsanitary: 4 },
    supplies_stock: { full: 0, low: 1, empty: 3 },
    grout_condition: { clean: 0, discolored: 1, moldy: 3 },
    carpet_condition: { clean: 0, light_stains: 1, stained: 2, heavily_soiled: 4 },
    workstation_clutter: { clear: 0, moderate: 1, heavy: 2 },
};

export function determineAppaLevel(answers: QuestionnaireAnswer[]): number {
    const answerMap = new Map(answers.map((a) => [a.question_id, a.answer]));

    let total = 0;
    let maxPossible = 0;
    let factors = 0;

    for (const [qid, mapping] of Object.entries(conditionScores)) {
        const ans = answerMap.get(qid);
        if (ans === undefined) continue;
        const val = typeof ans === "string" ? ans : ans[0];
        const score = mapping[val] ?? 0;
        const max = Math.max(...Object.values(mapping));
        total += score;
        maxPossible += max;
        factors++;
    }

    // special requirements bump
    const specials = answerMap.get("special_requirements");
    if (Array.isArray(specials)) {
        if (specials.includes("biohazard")) { total += 4; maxPossible += 4; factors++; }
        if (specials.includes("disinfection")) { total += 2; maxPossible += 4; factors++; }
        if (specials.includes("allergen_control")) { total += 2; maxPossible += 4; factors++; }
    }

    // high traffic raises needed cleaning level
    const highTraffic = answerMap.get("high_traffic");
    if (highTraffic === "yes") { total += 1; maxPossible += 4; factors++; }

    if (factors === 0 || maxPossible === 0) return 3; // default mid-level

    // ratio 0..1, map to internal levels 1..5
    const ratio = total / maxPossible;
    if (ratio <= 0.10) return 1; // premium daily condition
    if (ratio <= 0.25) return 2; // high hygiene needed
    if (ratio <= 0.45) return 3; // standard daily baseline
    if (ratio <= 0.70) return 4; // basic maintenance baseline
    return 5;                     // recovery deep-clean baseline
}

export const APPA_LABELS: Record<number, string> = {
    1: "Level 1 - Premium presentation clean",
    2: "Level 2 - High hygiene daily clean",
    3: "Level 3 - Standard daily clean",
    4: "Level 4 - Basic maintenance clean",
    5: "Level 5 - Recovery deep clean",
};

// ── Checklist generation ───────────────────────────────────────────────

export function generateChecklistFromAnswers(
    roomType: string,
    _cleaningStandard: string, // kept for API compat; APPA is auto-determined
    answers: QuestionnaireAnswer[],
): ChecklistItem[] {
    const level = determineAppaLevel(answers);
    const answerMap = new Map(answers.map((a) => [a.question_id, a.answer]));
    const items: ChecklistItem[] = [];
    let idx = 0;

    const add = (title: string, photoRequired = false, minLevel = 5) => {
        if (level >= minLevel || minLevel === 0) {
            idx++;
            items.push({
                id: `appa_${idx}`,
                title,
                done: false,
                photo_required: photoRequired,
                appa_level: minLevel || level,
            });
        }
    };

    // ── Universal items (all APPA levels) ──
    add("Remove visible litter and debris", false, 0);
    add("Empty all waste bins and replace liners", true, 0);
    add("Spot-clean spills and fresh marks", false, 0);

    // ── APPA 2+ ──
    add("Dust all horizontal surfaces", false, 2);
    add("Damp-mop hard floors", true, 2);
    add("Vacuum carpeted areas", false, 2);
    add("Clean entry glass and interior door glass", false, 2);
    add("Wipe light switches and door handles", false, 2);

    // ── APPA 3+ ── (more thorough – moderate issues)
    add("Dust vertical surfaces, vents, and diffusers", false, 3);
    add("Spot-clean walls and baseboards", false, 3);
    add("Clean all glass surfaces and mirrors", true, 3);
    add("Machine-scrub or auto-scrub hard floors", true, 3);
    add("Treat floor stains and scuff marks", true, 3);

    // ── APPA 4+ ── (significant cleaning needed)
    add("Deep-scrub all floor surfaces", true, 4);
    add("Full wall and baseboard wash", true, 4);
    add("Clean ceiling tiles and light fixtures", false, 4);
    add("Detailed vent and diffuser cleaning", false, 4);
    add("Odor treatment and source elimination", true, 4);
    add("Strip and refinish floor coating if applicable", true, 4);

    // ── APPA 5 ── (full restoration / neglected)
    add("Full facility deep clean – all surfaces", true, 5);
    add("Pressure wash or steam clean hard surfaces", true, 5);
    add("Carpet extraction / deep shampooing", true, 5);
    add("Biohazard cleanup if applicable", true, 5);
    add("Apply antimicrobial treatments", true, 5);
    add("Full odor neutralization treatment", true, 5);
    add("Repaint or touch-up heavily damaged surfaces", false, 5);

    // ── Room-type specific items ──
    switch (roomType) {
        case "bathroom":
            add("Sanitize all toilets, urinals, and seats", true, 0);
            add("Clean and polish sinks and faucets", true, 0);
            add("Clean mirrors", true, 2);
            add("Restock soap, paper towels, and toilet paper", true, 0);
            add("Clean tile grout lines", true, 3);
            add("Descale fixtures and showerheads", true, 4);
            add("Deep-clean drains and apply enzymatic cleaner", false, 4);
            {
                const fixtures = answerMap.get("fixture_condition");
                if (fixtures === "unsanitary") {
                    add("Full disinfection of all bathroom surfaces", true, 0);
                }
                const grout = answerMap.get("grout_condition");
                if (grout === "moldy") {
                    add("Apply mold/mildew remover to grout", true, 0);
                }
                const drains = answerMap.get("drain_condition");
                if (drains === "no") {
                    add("Report blocked drain to maintenance", false, 0);
                }
                const supplies = answerMap.get("supplies_stock");
                if (supplies === "empty" || supplies === "low") {
                    add("Full supply restock required", true, 0);
                }
            }
            break;

        case "office":
            add("Wipe down all desk surfaces", false, 2);
            add("Clean phone handsets and shared equipment", false, 2);
            add("Dust monitor screens carefully", false, 3);
            {
                const electronics = answerMap.get("electronics_present");
                if (electronics === "yes") {
                    add("Use anti-static cleaning for electronics area", false, 0);
                }
                const clutter = answerMap.get("workstation_clutter");
                if (clutter === "heavy") {
                    add("Organize cluttered areas before cleaning", false, 0);
                }
                const carpet = answerMap.get("carpet_condition");
                if (carpet === "stained" || carpet === "heavily_soiled") {
                    add("Spot-treat carpet stains", true, 0);
                }
                if (carpet === "heavily_soiled") {
                    add("Schedule carpet deep extraction", true, 0);
                }
            }
            break;

        case "corridor":
            add("Mop full corridor length", true, 0);
            add("Wipe handrails and wall-mounted fixtures", false, 2);
            add("Clean wall scuff marks and fingerprints", false, 3);
            add("Polish hard floors / burnish", true, 4);
            {
                const traffic = answerMap.get("foot_traffic_level");
                if (traffic === "high") {
                    add("Deploy wet floor signs during cleaning", false, 0);
                    add("Use quick-dry products for minimal disruption", false, 0);
                }
                const floorType = answerMap.get("floor_type");
                if (floorType === "carpet" || floorType === "mixed") {
                    add("Vacuum carpet sections of corridor", false, 0);
                }
                const signage = answerMap.get("signage_available");
                if (signage === "no" && traffic === "high") {
                    add("Request wet floor signage from supply room", false, 0);
                }
            }
            break;
    }

    // ── Special requirements ──
    const specials = answerMap.get("special_requirements");
    if (Array.isArray(specials)) {
        if (specials.includes("disinfection")) {
            add("Apply hospital-grade disinfectant to all surfaces", true, 0);
        }
        if (specials.includes("allergen_control")) {
            add("Use HEPA-filtered vacuum on all surfaces", false, 0);
            add("Damp-wipe to capture allergens", false, 0);
        }
        if (specials.includes("antistatic")) {
            add("Apply anti-static treatment to floors and equipment areas", false, 0);
        }
        if (specials.includes("eco_products")) {
            add("Use only eco-certified cleaning products", false, 0);
        }
        if (specials.includes("biohazard")) {
            add("Don PPE for biohazard cleanup", false, 0);
            add("Biohazard cleanup and disposal per protocol", true, 0);
        }
    }

    // ── Heavy equipment follow-up ──
    const heavyEquip = answerMap.get("heavy_equipment_available");
    if (heavyEquip === "yes") {
        add("Use floor scrubber / extractor for deep clean", true, 0);
    }

    // ── Odor follow-up ──
    const odorSource = answerMap.get("odor_source");
    if (odorSource === "mold") {
        add("Apply mold remediation treatment", true, 0);
    } else if (odorSource === "drain") {
        add("Report plumbing/drain issue to maintenance", false, 0);
    }

    // ── Quality documentation (APPA 1-2 maintain, APPA 3+ verify improvement) ──
    if (level >= 3) {
        add("Take before-cleaning photo documentation", true, 0);
    }
    add("Take after-cleaning photo documentation", true, 0);
    add("Self-inspect completed work against APPA standard", true, 0);

    return items;
}
