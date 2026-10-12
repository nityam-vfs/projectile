export type HierarchyItem = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  type: "task" | "summary" | "milestone";
};

/** Move a task and its descendants as one WBS block, returning the new flat preorder. */
export function moveTaskInHierarchy<T extends HierarchyItem>(tasks: T[], taskId: string, direction: -1 | 1): T[] | null {
  const ordered = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(ordered.map(task => [task.id, { ...task }]));
  const children = new Map<string | null, string[]>();
  for (const task of ordered) {
    if (task.parentId && !byId.has(task.parentId)) return null;
    children.set(task.parentId, [...(children.get(task.parentId) ?? []), task.id]);
  }

  const task = byId.get(taskId);
  if (!task) return null;
  if (direction === 1) {
    const siblings = children.get(task.parentId) ?? [];
    const index = siblings.indexOf(taskId);
    if (index <= 0) return null;
    const newParent = byId.get(siblings[index - 1])!;
    if (newParent.type === "milestone") return null;
    siblings.splice(index, 1);
    task.parentId = newParent.id;
    if (newParent.type === "task") newParent.type = "summary";
    children.set(newParent.id, [...(children.get(newParent.id) ?? []), taskId]);
  } else {
    if (!task.parentId) return null;
    const oldParent = byId.get(task.parentId)!;
    const oldChildren = children.get(oldParent.id) ?? [];
    const index = oldChildren.indexOf(taskId);
    if (index < 0) return null;
    oldChildren.splice(index, 1);
    if (oldChildren.length === 0 && oldParent.type === "summary") oldParent.type = "task";
    const siblings = children.get(oldParent.parentId) ?? [];
    const parentIndex = siblings.indexOf(oldParent.id);
    if (parentIndex < 0) return null;
    siblings.splice(parentIndex + 1, 0, taskId);
    task.parentId = oldParent.parentId;
  }

  const result: T[] = [];
  const visiting = new Set<string>();
  const walk = (parentId: string | null) => {
    for (const id of children.get(parentId) ?? []) {
      if (visiting.has(id)) return;
      visiting.add(id);
      const row = byId.get(id)!;
      result.push({ ...row, sortOrder: result.length } as T);
      walk(id);
    }
  };
  walk(null);
  return result.length === tasks.length ? result : null;
}

/** Insert a task after the selected sibling, including the selected task's subtree. */
export function insertTaskAfter<T extends HierarchyItem>(tasks: T[], newTask: T, selectedId: string | null): T[] | null {
  if (tasks.some(task => task.id === newTask.id)) return null;
  const ordered = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(ordered.map(task => [task.id, { ...task }]));
  const children = new Map<string | null, string[]>();
  for (const task of ordered) {
    if (task.parentId && !byId.has(task.parentId)) return null;
    children.set(task.parentId, [...(children.get(task.parentId) ?? []), task.id]);
  }
  const inserted = { ...newTask };
  const selected = selectedId ? byId.get(selectedId) : undefined;
  inserted.parentId = selected?.parentId ?? null;
  byId.set(inserted.id, inserted);
  const siblings = children.get(inserted.parentId) ?? [];
  if (selected) {
    const index = siblings.indexOf(selected.id);
    if (index < 0) return null;
    siblings.splice(index + 1, 0, inserted.id);
  } else {
    siblings.push(inserted.id);
  }
  children.set(inserted.parentId, siblings);

  const result: T[] = [];
  const visiting = new Set<string>();
  const walk = (parentId: string | null) => {
    for (const id of children.get(parentId) ?? []) {
      if (visiting.has(id)) return;
      visiting.add(id);
      const row = byId.get(id)!;
      result.push({ ...row, sortOrder: result.length } as T);
      walk(id);
    }
  };
  walk(null);
  return result.length === tasks.length + 1 ? result : null;
}
