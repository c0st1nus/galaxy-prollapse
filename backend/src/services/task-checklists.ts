import {and, desc, eq} from "drizzle-orm";
import {db} from "../database";
import {checklistTemplates, taskChecklists} from "../database/schema";

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  done: boolean;
  note?: string;
}

function safeChecklistArray(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ChecklistItem[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const raw = entry as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) {
      continue;
    }

    items.push({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `item-${index + 1}`,
      label,
      required: typeof raw.required === "boolean" ? raw.required : true,
      done: typeof raw.done === "boolean" ? raw.done : false,
      note: typeof raw.note === "string" ? raw.note : undefined,
    });
  }

  return items;
}

function defaultChecklistLabels(roomType: string, cleaningStandard: string): string[] {
  const byRoomType: Record<string, string[]> = {
    office: [
      "dust desks and horizontal surfaces",
      "empty trash bins and replace liners",
      "vacuum or mop floor",
      "sanitize high-touch points",
    ],
    bathroom: [
      "sanitize sinks and taps",
      "clean toilets and urinals",
      "refill soap and paper supplies",
      "mop and disinfect floor",
    ],
    corridor: [
      "clear visible litter",
      "dust ledges and handrails",
      "spot-clean marks on walls/glass",
      "vacuum or mop walkway",
    ],
  };

  const fallback = [
    "remove visible dirt and debris",
    "clean high-touch surfaces",
    "restore supplies and consumables",
    "leave area inspection-ready",
  ];

  const roomItems = byRoomType[roomType] ?? fallback;
  if (cleaningStandard.toLowerCase().startsWith("appa_")) {
    return roomItems;
  }

  // keep issa-based templates a bit stricter in baseline wording.
  return roomItems.map((item) => `${item} (issa-cims baseline)`);
}

export function buildDefaultChecklistItems(roomType: string, cleaningStandard: string): ChecklistItem[] {
  return defaultChecklistLabels(roomType, cleaningStandard).map((label, index) => ({
    id: `default-${index + 1}`,
    label,
    required: true,
    done: false,
  }));
}

export function calculateCompletionPercent(items: ChecklistItem[]): number {
  if (!items.length) {
    return 0;
  }

  const requiredItems = items.filter((item) => item.required);
  if (!requiredItems.length) {
    return 100;
  }

  const doneCount = requiredItems.filter((item) => item.done).length;
  return Math.round((doneCount / requiredItems.length) * 100);
}

export async function getOrCreateTaskChecklist(input: {
  taskId: number;
  companyId: number;
  roomType: "office" | "bathroom" | "corridor";
  cleaningStandard: string;
}) {
  const existing = await db.query.taskChecklists.findFirst({
    where: eq(taskChecklists.task_id, input.taskId),
  });
  if (existing) {
    return existing;
  }

  const latestTemplate = await db.select()
    .from(checklistTemplates)
    .where(and(
      eq(checklistTemplates.company_id, input.companyId),
      eq(checklistTemplates.room_type, input.roomType),
      eq(checklistTemplates.cleaning_standard, input.cleaningStandard),
    ))
    .orderBy(desc(checklistTemplates.version))
    .limit(1);

  let template = latestTemplate[0];
  if (!template) {
    const defaults = buildDefaultChecklistItems(input.roomType, input.cleaningStandard);
    const created = await db.insert(checklistTemplates).values({
      company_id: input.companyId,
      room_type: input.roomType,
      cleaning_standard: input.cleaningStandard,
      version: 1,
      items: defaults,
    }).returning();
    template = created[0];
  }

  const templateItems = safeChecklistArray(template.items);
  const checklistItems = templateItems.length
    ? templateItems.map((item) => ({...item, done: false, note: undefined}))
    : buildDefaultChecklistItems(input.roomType, input.cleaningStandard);

  const completionPercent = calculateCompletionPercent(checklistItems);

  try {
    const inserted = await db.insert(taskChecklists).values({
      task_id: input.taskId,
      template_id: template.id,
      items: checklistItems,
      completion_percent: completionPercent,
      generated_at: new Date(),
      updated_at: new Date(),
    }).returning();
    return inserted[0];
  } catch (error: any) {
    // if another request created it first, return the existing checklist.
    if (error?.code === "23505") {
      const row = await db.query.taskChecklists.findFirst({
        where: eq(taskChecklists.task_id, input.taskId),
      });
      if (row) {
        return row;
      }
    }
    throw error;
  }
}

export async function updateTaskChecklist(taskId: number, rawItems: unknown) {
  const items = safeChecklistArray(rawItems);
  const completionPercent = calculateCompletionPercent(items);

  const updated = await db.update(taskChecklists)
    .set({
      items,
      completion_percent: completionPercent,
      updated_at: new Date(),
    })
    .where(eq(taskChecklists.task_id, taskId))
    .returning();

  return updated[0] ?? null;
}
