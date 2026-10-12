import { z } from "zod";
import { supabase, supabaseUnavailable } from "@/db/supabase";
import { requireWriteAccess } from "@/lib/api";
import { dependencyFromDb, taskFromDb } from "@/lib/db-mapping";
import { schedule, type WorkCalendar } from "@/lib/scheduler";

const input = z.object({
  tasks: z.array(z.object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.number().int().min(0),
    type: z.enum(["task", "summary", "milestone"]),
  }).strict()).min(1).max(5000),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { requireWriteAccess(request); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 401 }); }
  if (!supabase) return supabaseUnavailable();
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { projectId } = await params;
  const [{ data: project, error: projectError }, { data: currentRows, error: tasksError }, { data: dependencyRows, error: dependenciesError }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
    supabase.from("task_dependencies").select("*").eq("project_id", projectId),
  ]);
  if (projectError || tasksError || dependenciesError) return Response.json({ error: projectError?.message ?? tasksError?.message ?? dependenciesError?.message }, { status: 500 });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  try {
    const patches = parsed.data.tasks;
    if (new Set(patches.map(row => row.id)).size !== patches.length) throw new Error("A task can only appear once in a reorder request.");
    const currentById = new Map((currentRows ?? []).map(row => [row.id, row]));
    for (const patch of patches) if (!currentById.has(patch.id)) throw new Error("A reordered task does not belong to this project.");

    const patchById = new Map(patches.map(row => [row.id, row]));
    const next = (currentRows ?? []).map(row => {
      const patch = patchById.get(row.id);
      return { ...row, parent_id: patch ? patch.parentId : row.parent_id, sort_order: patch ? patch.sortOrder : row.sort_order, type: patch ? patch.type : row.type };
    });
    const nextById = new Map(next.map(row => [row.id, row]));
    for (const row of next) {
      if (row.parent_id && !nextById.has(row.parent_id)) throw new Error("Parent task must belong to the same project.");
      if (row.parent_id && nextById.get(row.parent_id)?.type === "milestone") throw new Error("A milestone cannot contain child tasks.");
    }
    const parentIds = new Set(next.map(row => row.parent_id).filter((id): id is string => Boolean(id)));
    for (const parentId of parentIds) if (nextById.get(parentId)?.type !== "summary") throw new Error("Tasks with children must use the Summary type.");

    const links = (dependencyRows ?? []).map(dependencyFromDb);
    schedule(next.map(row => ({ id: row.id, name: row.name, duration: row.duration, type: row.type as "task" | "milestone" | "summary", parentId: row.parent_id, start: row.start_constraint, percentComplete: row.percent_complete })), links.map(link => ({ predecessorId: link.predecessorId, successorId: link.successorId, type: link.type as "FS" | "SS" | "FF" | "SF", lag: link.lag })), project.start_date, project.calendar as WorkCalendar);

    const rowsToSave = next.filter(row => {
      const old = currentById.get(row.id)!;
      return old.parent_id !== row.parent_id || old.sort_order !== row.sort_order || old.type !== row.type;
    });
    if (rowsToSave.length) {
      const { error } = await supabase.from("tasks").upsert(rowsToSave, { onConflict: "id" });
      if (error) return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(next.sort((a, b) => a.sort_order - b.sort_order).map(taskFromDb));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
