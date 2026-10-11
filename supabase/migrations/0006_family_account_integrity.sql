-- Hope Horizon 0006: student/parent account integrity and atomic parent-child linking.
-- Apply once AFTER migrations 0001..0005. No demo data is inserted.
begin;

-- Prevent one Auth user from claiming multiple unrelated student records.
create unique index if not exists hh_students_unique_auth_account
  on public.students(user_id) where user_id is not null;

create or replace function public.hh_check_student_auth_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    if not exists (
      select 1 from public.users u where u.id = new.user_id
        and u.school_id = new.school_id and u.role = 'STUDENT'::public.user_role
        and u.is_active
    ) then
      raise exception 'Student account must be active, belong to this school, and have STUDENT role'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.hh_check_student_auth_link() from public, anon, authenticated;
drop trigger if exists hh_guard_student_auth_link on public.students;
create trigger hh_guard_student_auth_link
before update on public.students
for each row execute function public.hh_check_student_auth_link();

create or replace function public.hh_check_parent_student_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.parents p
    join public.students s on s.id = new.student_id
    where p.id = new.parent_id and p.school_id = s.school_id
  ) then
    raise exception 'Parent and student must belong to the same school'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.hh_check_parent_student_link() from public, anon, authenticated;
drop trigger if exists hh_guard_parent_student_school on public.parent_students;
create trigger hh_guard_parent_student_school
before insert or update on public.parent_students
for each row execute function public.hh_check_parent_student_link();

-- One transaction: either all requested links are updated or none are.
create or replace function public.hh_admin_replace_parent_children(
  p_parent_id uuid, p_student_ids uuid[]
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_role public.user_role;
  v_parent_school uuid;
begin
  select u.school_id, u.role into v_school, v_role
  from public.users u where u.id = auth.uid() and u.is_active;
  if v_school is null or v_role is distinct from 'ADMIN'::public.user_role then
    raise exception 'School administrator required' using errcode = '42501';
  end if;
  select p.school_id into v_parent_school from public.parents p
    where p.id = p_parent_id and p.is_active for update;
  if v_parent_school is distinct from v_school then
    raise exception 'Parent does not belong to your school' using errcode = '42501';
  end if;
  if p_student_ids is null or coalesce(array_length(p_student_ids,1),0) not between 1 and 50
     or (select count(distinct value) from unnest(p_student_ids) as x(value))
         <> coalesce(array_length(p_student_ids,1),0)
     or exists (select 1 from unnest(p_student_ids) as x(value) where value is null) then
    raise exception 'Provide 1 to 50 distinct student identifiers' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) as x(student_id)
    left join public.students s on s.id = x.student_id
      and s.school_id = v_school and s.is_active
    where s.id is null
  ) then
    raise exception 'Each child must be an active student in your school' using errcode = '22023';
  end if;
  delete from public.parent_students where parent_id = p_parent_id;
  insert into public.parent_students(parent_id, student_id)
    select p_parent_id, x.student_id from unnest(p_student_ids) as x(student_id);
  return true;
end;
$$;
revoke all on function public.hh_admin_replace_parent_children(uuid,uuid[]) from public, anon;
grant execute on function public.hh_admin_replace_parent_children(uuid,uuid[]) to authenticated;

commit;
