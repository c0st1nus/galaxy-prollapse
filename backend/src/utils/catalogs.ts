export type CatalogOption = {
    value: string;
    label: string;
};

export const ROOM_TYPE_OPTIONS: CatalogOption[] = [
    { value: "office", label: "Office" },
    { value: "bathroom", label: "Bathroom" },
    { value: "corridor", label: "Corridor" },
    { value: "kitchen", label: "Kitchen" },
    { value: "lobby", label: "Lobby" },
    { value: "conference_room", label: "Conference room" },
    { value: "stairwell", label: "Stairwell" },
    { value: "elevator", label: "Elevator" },
    { value: "storage", label: "Storage room" },
    { value: "classroom", label: "Classroom" },
];

export const TASK_EVENT_TYPE_OPTIONS: CatalogOption[] = [
    { value: "start_cleaning", label: "Start cleaning" },
    { value: "pause_cleaning", label: "Pause cleaning" },
    { value: "resume_cleaning", label: "Resume cleaning" },
    { value: "complete_cleaning", label: "Complete cleaning" },
    { value: "quality_check", label: "Quality check" },
    { value: "supply_issue", label: "Supply issue" },
    { value: "maintenance_issue", label: "Maintenance issue" },
    { value: "client_request", label: "Client request" },
    { value: "incident_reported", label: "Incident reported" },
    { value: "note", label: "General note" },
];

const taskEventTypeSet = new Set(TASK_EVENT_TYPE_OPTIONS.map((row) => row.value));

export function isPredefinedTaskEventType(value: string): boolean {
    return taskEventTypeSet.has(value);
}
