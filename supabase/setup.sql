CREATE TABLE "calendar_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"working" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"calendar" jsonb DEFAULT '{"workingDays":[1,2,3,4,5],"holidays":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"start" date,
	"finish" date,
	"duration" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"type" text DEFAULT 'FS' NOT NULL,
	"lag" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"duration" integer DEFAULT 1 NOT NULL,
	"type" text DEFAULT 'task' NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"start_constraint" date,
	"notes" text DEFAULT '' NOT NULL,
	"expanded" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_baselines" ADD CONSTRAINT "project_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_baselines" ADD CONSTRAINT "task_baselines_baseline_id_project_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."project_baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_baselines" ADD CONSTRAINT "task_baselines_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_tasks_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_id_tasks_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "tasks" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "finish_date" date;
-- The anon key can read project data, but all writes require the shared API token.
CREATE SCHEMA IF NOT EXISTS planwise_private;
REVOKE ALL ON SCHEMA planwise_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS planwise_private.settings (key text PRIMARY KEY, value text NOT NULL);
REVOKE ALL ON planwise_private.settings FROM PUBLIC, anon, authenticated;
INSERT INTO planwise_private.settings(key,value) VALUES ('write_token','REPLACE_WITH_APP_WRITE_TOKEN') ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.planwise_write_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,planwise_private AS $$
 SELECT coalesce(current_setting('request.headers',true)::jsonb->>'x-planwise-write-token','')=(SELECT value FROM planwise_private.settings WHERE key='write_token')
$$;
REVOKE ALL ON FUNCTION public.planwise_write_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planwise_write_allowed() TO anon;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.projects,public.tasks,public.task_dependencies,public.calendar_exceptions,public.project_baselines,public.task_baselines TO anon;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_read ON public.projects FOR SELECT TO anon USING (true);
CREATE POLICY projects_write ON public.projects FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());
CREATE POLICY tasks_read ON public.tasks FOR SELECT TO anon USING (true);
CREATE POLICY tasks_write ON public.tasks FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());
CREATE POLICY dependencies_read ON public.task_dependencies FOR SELECT TO anon USING (true);
CREATE POLICY dependencies_write ON public.task_dependencies FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());
CREATE POLICY exceptions_read ON public.calendar_exceptions FOR SELECT TO anon USING (true);
CREATE POLICY exceptions_write ON public.calendar_exceptions FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());
CREATE POLICY project_baselines_read ON public.project_baselines FOR SELECT TO anon USING (true);
CREATE POLICY project_baselines_write ON public.project_baselines FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());
CREATE POLICY task_baselines_read ON public.task_baselines FOR SELECT TO anon USING (true);
CREATE POLICY task_baselines_write ON public.task_baselines FOR ALL TO anon USING (public.planwise_write_allowed()) WITH CHECK (public.planwise_write_allowed());

CREATE OR REPLACE FUNCTION public.save_task_with_dependencies(p_task jsonb,p_predecessors jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE saved public.tasks;
BEGIN
 INSERT INTO public.tasks(id,project_id,parent_id,name,duration,type,percent_complete,sort_order,start_constraint,notes,expanded)
 VALUES ((p_task->>'id')::uuid,(p_task->>'project_id')::uuid,nullif(p_task->>'parent_id','')::uuid,p_task->>'name',(p_task->>'duration')::integer,p_task->>'type',(p_task->>'percent_complete')::integer,(p_task->>'sort_order')::integer,nullif(p_task->>'start_constraint','')::date,coalesce(p_task->>'notes',''),coalesce((p_task->>'expanded')::boolean,true))
 ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,duration=excluded.duration,type=excluded.type,percent_complete=excluded.percent_complete,sort_order=excluded.sort_order,start_constraint=excluded.start_constraint,notes=excluded.notes,expanded=excluded.expanded
 WHERE tasks.project_id=excluded.project_id RETURNING * INTO saved;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Task not found in this project'; END IF;
 DELETE FROM public.task_dependencies WHERE project_id=saved.project_id AND successor_id=saved.id;
 INSERT INTO public.task_dependencies(project_id,predecessor_id,successor_id,type,lag)
 SELECT saved.project_id,(item->>'predecessor_id')::uuid,saved.id,item->>'type',coalesce((item->>'lag')::integer,0) FROM jsonb_array_elements(coalesce(p_predecessors,'[]'::jsonb)) item;
 RETURN to_jsonb(saved);
END $$;
GRANT EXECUTE ON FUNCTION public.save_task_with_dependencies(jsonb,jsonb) TO anon;
