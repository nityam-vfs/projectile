export type LinkType = "FS" | "SS" | "FF" | "SF";
export type WorkCalendar = { workingDays?: number[]; holidays?: string[]; exceptions?: Record<string, boolean> };
export type ScheduleTask = { id: string; name: string; duration: number; type?: "task" | "milestone" | "summary"; parentId?: string | null; start?: string | null; percentComplete?: number };
export type Dependency = { predecessorId: string; successorId: string; type: LinkType; lag: number };
export type ScheduledTask = ScheduleTask & { start: string; finish: string; earlyStart: string; earlyFinish: string; lateStart: string; lateFinish: string; totalFloat: number; critical: boolean };

const asDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const workday = (d: Date, calendar: WorkCalendar = {}) => { const key=iso(d); if(calendar.exceptions&&key in calendar.exceptions)return calendar.exceptions[key]; if(calendar.holidays?.includes(key))return false; return (calendar.workingDays??[1,2,3,4,5]).includes(d.getUTCDay()); };
function shift(date: Date, amount: number, calendar: WorkCalendar = {}): Date {
  const d = new Date(date); const dir = amount < 0 ? -1 : 1;
  for (let n = Math.abs(amount); n > 0;) { d.setUTCDate(d.getUTCDate() + dir); if (workday(d,calendar)) n--; }
  return d;
}
function onOrAfterWorkday(date: Date, calendar: WorkCalendar = {}) { const d = new Date(date); while (!workday(d,calendar)) d.setUTCDate(d.getUTCDate() + 1); return d; }
function onOrBeforeWorkday(date: Date, calendar: WorkCalendar = {}) { const d = new Date(date); while (!workday(d,calendar)) d.setUTCDate(d.getUTCDate() - 1); return d; }
function finishFrom(start: Date, duration: number, calendar: WorkCalendar = {}) { return duration === 0 ? start : shift(start, duration - 1,calendar); }
function startFromFinish(finish: Date, duration: number, calendar: WorkCalendar = {}) { return duration === 0 ? finish : shift(finish, -(duration - 1),calendar); }
function dayDiff(a: Date, b: Date, calendar: WorkCalendar = {}) { let n = 0; for (let d = new Date(a); d < b;) { d.setUTCDate(d.getUTCDate() + 1); if (workday(d,calendar)) n++; } return n; }

export function parsePredecessors(input: string, displayIds: Map<string, string>): Dependency[] {
  if (!input.trim()) return [];
  return input.split(",").map((part) => {
    const m = part.trim().match(/^(\d+)(FS|SS|FF|SF)?(?:([+-])(\d+)d)?$/i);
    if (!m) throw new Error(`Invalid predecessor “${part.trim()}”. Use values such as 2FS or 3SS+1d.`);
    const predecessorId = displayIds.get(m[1]);
    if (!predecessorId) throw new Error(`Task ID ${m[1]} does not exist.`);
    return { predecessorId, successorId: "", type: (m[2]?.toUpperCase() ?? "FS") as LinkType, lag: m[4] ? Number(m[4]) * (m[3] === "-" ? -1 : 1) : 0 };
  });
}

export function schedule(tasks: ScheduleTask[], dependencies: Dependency[], projectStart: string, calendar: WorkCalendar = {}): ScheduledTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const incoming = new Map(tasks.map(t => [t.id, [] as Dependency[]]));
  const outgoing = new Map(tasks.map(t => [t.id, [] as Dependency[]]));
  const edgeKeys = new Set<string>();
  for (const e of dependencies) {
    if (e.predecessorId === e.successorId) throw new Error("A task cannot depend on itself.");
    if (!byId.has(e.predecessorId) || !byId.has(e.successorId)) throw new Error("A dependency references a missing task.");
    if (byId.get(e.predecessorId)?.type === "summary" || byId.get(e.successorId)?.type === "summary") throw new Error("Dependencies on summary tasks are not supported.");
    const key=`${e.predecessorId}:${e.successorId}`; if(edgeKeys.has(key))throw new Error("Duplicate dependency between the same tasks."); edgeKeys.add(key);
    incoming.get(e.successorId)!.push(e); outgoing.get(e.predecessorId)!.push(e);
  }
  const indegree = new Map(tasks.map(t => [t.id, incoming.get(t.id)!.length]));
  const queue = tasks.filter(t => indegree.get(t.id) === 0).map(t => t.id); const order: string[] = [];
  while (queue.length) { const id = queue.shift()!; order.push(id); for (const e of outgoing.get(id)!) { indegree.set(e.successorId, indegree.get(e.successorId)! - 1); if (!indegree.get(e.successorId)) queue.push(e.successorId); } }
  if (order.length !== tasks.length) throw new Error("Circular dependency detected. Remove a predecessor link to continue.");
  const base = onOrAfterWorkday(asDate(projectStart),calendar);
  const starts = new Map<string, Date>(); const finishes = new Map<string, Date>();
  for (const id of order) {
    const t = byId.get(id)!; let start = t.start ? onOrAfterWorkday(asDate(t.start),calendar) : base;
    for (const e of incoming.get(id)!) {
      const ps = starts.get(e.predecessorId)!; const pf = finishes.get(e.predecessorId)!;
      let bound: Date;
      if (e.type === "FS") bound = shift(pf, 1 + e.lag,calendar);
      else if (e.type === "SS") bound = shift(ps, e.lag,calendar);
      else if (e.type === "FF") bound = startFromFinish(shift(pf, e.lag,calendar), t.duration,calendar);
      else bound = startFromFinish(shift(ps, e.lag,calendar), t.duration,calendar);
      if (bound > start) start = bound;
    }
    start = onOrAfterWorkday(start,calendar); starts.set(id, start); finishes.set(id, finishFrom(start, t.duration,calendar));
  }
  const end = new Date(Math.max(...[...finishes.values()].map(d => d.getTime())));
  const lateS = new Map<string, Date>(); const lateF = new Map<string, Date>();
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!; let latestStart = startFromFinish(end, t.duration,calendar);
    for (const e of outgoing.get(id)!) {
      const ss = lateS.get(e.successorId)!; const sf = lateF.get(e.successorId)!;
      let bound: Date;
      if (e.type === "FS") bound = shift(ss, -(Math.max(1,t.duration) + e.lag),calendar);
      else if (e.type === "SS") bound = shift(ss, -e.lag,calendar);
      else if (e.type === "FF") bound = shift(sf, -(t.duration - 1 + e.lag),calendar);
      else bound = shift(sf, -e.lag,calendar);
      if (bound < latestStart) latestStart = bound;
    }
    const ls = onOrBeforeWorkday(latestStart,calendar);
    lateF.set(id, finishFrom(ls, t.duration,calendar)); lateS.set(id, ls);
  }
  const result = tasks.map(t => {
    const es = starts.get(t.id)!; const ef = finishes.get(t.id)!; const ls = lateS.get(t.id)!; const lf = lateF.get(t.id)!;
    const totalFloat = Math.max(0, dayDiff(es, ls,calendar));
    return { ...t, start: iso(es), finish: iso(ef), earlyStart: iso(es), earlyFinish: iso(ef), lateStart: iso(ls), lateFinish: iso(lf), totalFloat, critical: totalFloat === 0 };
  });
  const resultById = new Map(result.map(t => [t.id, t]));
  const leavesBelow = (id: string): typeof result => tasks.filter(t => t.parentId === id).flatMap(child => child.type === "summary" ? leavesBelow(child.id) : [resultById.get(child.id)!]);
  for (const summary of tasks.filter(t => t.type === "summary")) {
    const leaves = leavesBelow(summary.id).filter(Boolean);
    if (!leaves.length) continue;
    const start = new Date(Math.min(...leaves.map(t => Date.parse(`${t.start}T00:00:00Z`))));
    const finish = new Date(Math.max(...leaves.map(t => Date.parse(`${t.finish}T00:00:00Z`))));
    let span = 0; for (let d = new Date(start); d <= finish; d.setUTCDate(d.getUTCDate()+1)) if (workday(d,calendar)) span++;
    const weight = leaves.reduce((n,t)=>n+Math.max(0,t.duration),0);
    const progress = weight ? Math.round(leaves.reduce((n,t)=>n+Math.max(0,t.duration)*(t.percentComplete??0),0)/weight) : 0;
    const row=resultById.get(summary.id)!;
    Object.assign(row,{start:iso(start),finish:iso(finish),earlyStart:iso(start),earlyFinish:iso(finish),duration:span,percentComplete:progress,totalFloat:Math.min(...leaves.map(t=>t.totalFloat)),critical:leaves.some(t=>t.critical)});
  }
  return result;
}

export function wbsCodes<T extends { id: string; parentId?: string | null; sortOrder: number }>(tasks: T[]): Map<string, string> {
  const children = new Map<string | null, T[]>();
  for (const t of tasks) { const key = t.parentId ?? null; children.set(key, [...(children.get(key) ?? []), t]); }
  for (const list of children.values()) list.sort((a,b) => a.sortOrder - b.sortOrder);
  const result = new Map<string,string>();
  const walk = (parent: string | null, prefix: string) => (children.get(parent) ?? []).forEach((t, i) => { const code = prefix ? `${prefix}.${i+1}` : `${i+1}`; result.set(t.id, code); walk(t.id, code); });
  walk(null, ""); return result;
}
