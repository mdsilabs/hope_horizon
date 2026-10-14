-- Staging ONLY: Hope Horizon result-workflow QA fixture.
-- Run after migrations 0001-0013 in a dedicated, empty staging Supabase project.
-- Never apply to the production school. Auth accounts are provisioned separately.
begin;
do $$
declare
  v_school uuid; v_session uuid; v_term uuid; v_class uuid;
  v_subject uuid;
  v_codes text[] := array['MAT','ENG','BSC','SOC','ICT'];
  v_names text[] := array['Mathematics','English Language','Basic Science','Social Studies','Computer Studies'];
  i integer;
begin
  if exists(select 1 from public.schools where name <> 'Hope Horizon QA STAGING') then
    raise exception 'Refusing to seed: non-staging school exists in this database';
  end if;
  if exists(select 1 from public.schools where name='Hope Horizon QA STAGING') then
    raise exception 'QA fixture already installed: do not reapply';
  end if;
  insert into public.schools(name,levels,academic_structure_type,academic_period_label,
    periods_per_session,ca_max_score,exam_max_score,grading_scale)
  values ('Hope Horizon QA STAGING',array['SECONDARY']::public.school_level[],'TERM','Term',
    3,40,60,'[{"minScore":70,"maxScore":100,"grade":"A","remark":"Excellent"},{"minScore":60,"maxScore":69.99,"grade":"B","remark":"Very Good"},{"minScore":50,"maxScore":59.99,"grade":"C","remark":"Good"},{"minScore":45,"maxScore":49.99,"grade":"D","remark":"Pass"},{"minScore":0,"maxScore":44.99,"grade":"F","remark":"Fail"}]'::jsonb)
  returning id into v_school;

  insert into public.academic_sessions(school_id,name,start_date,end_date,is_current)
    values(v_school,'2026/2027','2026-09-01','2027-07-31',true)
    returning id into v_session;
  insert into public.terms(school_id,academic_session_id,name,structure_type,"order",start_date,end_date,is_current)
    values(v_school,v_session,'First Term','TERM',1,'2026-09-01','2026-12-18',true)
    returning id into v_term;
  update public.schools set current_academic_session_id=v_session,current_term_id=v_term
    where id=v_school;
  insert into public.classes(school_id,name,level,arm,"order")
    values(v_school,'JSS 1 QA','SECONDARY','QA',1) returning id into v_class;

  for i in 1..5 loop
    insert into public.subjects(school_id,name,code)
      values(v_school,v_names[i],v_codes[i]) returning id into v_subject;
    insert into public.class_subjects(class_id,subject_id) values(v_class,v_subject);
  end loop;
end $$;
commit;
