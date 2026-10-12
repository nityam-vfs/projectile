import { z } from "zod";
import { supabase, supabaseUnavailable } from "@/db/supabase";
import { requireWriteAccess } from "@/lib/api";

const createSchema = z.object({ name: z.string().trim().min(1).max(120), replaceId: z.string().uuid().optional() }).strict();

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!supabase) return supabaseUnavailable();
  const { projectId } = await params;
  const { data: baselines, error } = await supabase.from("project_baselines").select("id,project_id,name,created_at").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const ids = (baselines ?? []).map(b => b.id);
  const { data: rows, error: rowError } = ids.length ? await supabase.from("task_baselines").select("baseline_id,task_id,start,finish,duration").in("baseline_id", ids) : { data: [], error: null };
  if (rowError) return Response.json({ error: rowError.message }, { status: 500 });
  return Response.json((baselines ?? []).map(b => ({ id: b.id, name: b.name, createdAt: b.created_at, tasks: (rows ?? []).filter(r => r.baseline_id === b.id).map(r => ({ taskId: r.task_id, start: r.start, finish: r.finish, duration: r.duration })) })));
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { requireWriteAccess(request); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 401 }); }
  if (!supabase) return supabaseUnavailable();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { projectId } = await params;
  if (parsed.data.replaceId) {
    const { data: existing, error } = await supabase.from("project_baselines").select("id").eq("id", parsed.data.replaceId).eq("project_id", projectId).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!existing) return Response.json({ error: "Baseline not found in this project." }, { status: 404 });
  }
  const { data: currentTasks, error: tasksError } = await supabase.from("tasks").select("id,start_date,finish_date,duration").eq("project_id", projectId);
  if (tasksError) return Response.json({ error: tasksError.message }, { status: 400 });
  const { data: baseline, error: baselineError } = await supabase.from("project_baselines").insert({ project_id: projectId, name: parsed.data.name }).select("id,project_id,name,created_at").single();
  if (baselineError) return Response.json({ error: baselineError.message }, { status: 400 });
  const entries = (currentTasks ?? []).map(t => ({ baseline_id: baseline.id, task_id: t.id, start: t.start_date, finish: t.finish_date, duration: t.duration }));
  if (entries.length) {
    const { error } = await supabase.from("task_baselines").insert(entries);
    if (error) { await supabase.from("project_baselines").delete().eq("id", baseline.id); return Response.json({ error: error.message }, { status: 400 }); }
  }
  if (parsed.data.replaceId) {
    const { error } = await supabase.from("project_baselines").delete().eq("id", parsed.data.replaceId).eq("project_id", projectId);
    if (error) { await supabase.from("project_baselines").delete().eq("id", baseline.id); return Response.json({ error: error.message }, { status: 400 }); }
  }
  return Response.json({ id: baseline.id, name: baseline.name, createdAt: baseline.created_at, tasks: entries.map(e => ({ taskId: e.task_id, start: e.start, finish: e.finish, duration: e.duration })) }, { status: 201 });
}
