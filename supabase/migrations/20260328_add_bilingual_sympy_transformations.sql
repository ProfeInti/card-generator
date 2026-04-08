alter table public.competitive_techniques
  add column if not exists sympy_transformation_es text,
  add column if not exists sympy_transformation_fr text;

alter table public.competitive_technique_catalog
  add column if not exists sympy_transformation_es text,
  add column if not exists sympy_transformation_fr text;

alter table public.competitive_technique_proposals
  add column if not exists sympy_transformation_es text,
  add column if not exists sympy_transformation_fr text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'competitive_techniques'
      and column_name = 'sympy_transformation'
  ) then
    execute $sql$
      update public.competitive_techniques
      set
        sympy_transformation_es = coalesce(sympy_transformation_es, sympy_transformation),
        sympy_transformation_fr = coalesce(sympy_transformation_fr, sympy_transformation)
      where sympy_transformation is not null
    $sql$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'competitive_technique_catalog'
      and column_name = 'sympy_transformation'
  ) then
    execute $sql$
      update public.competitive_technique_catalog
      set
        sympy_transformation_es = coalesce(sympy_transformation_es, sympy_transformation),
        sympy_transformation_fr = coalesce(sympy_transformation_fr, sympy_transformation)
      where sympy_transformation is not null
    $sql$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'competitive_technique_proposals'
      and column_name = 'sympy_transformation'
  ) then
    execute $sql$
      update public.competitive_technique_proposals
      set
        sympy_transformation_es = coalesce(sympy_transformation_es, sympy_transformation),
        sympy_transformation_fr = coalesce(sympy_transformation_fr, sympy_transformation)
      where sympy_transformation is not null
    $sql$;
  end if;
end
$$;
