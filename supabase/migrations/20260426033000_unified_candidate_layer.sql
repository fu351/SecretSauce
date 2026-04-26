create extension if not exists pg_trgm;

create index if not exists idx_standardized_ingredients_canonical_trgm
  on standardized_ingredients using gin (canonical_name gin_trgm_ops);

create table if not exists ingredient_token_idf_cache (
  token text primary key,
  document_count integer not null,
  doc_freq integer not null,
  idf_weight numeric not null,
  updated_at timestamptz not null default now()
);

create or replace function fn_refresh_ingredient_token_idf_cache()
returns integer
language plpgsql
security definer
as $$
declare
  v_document_count integer;
begin
  select count(*) into v_document_count
  from standardized_ingredients
  where canonical_name is not null and canonical_name <> '';

  delete from ingredient_token_idf_cache;

  insert into ingredient_token_idf_cache (token, document_count, doc_freq, idf_weight, updated_at)
  with token_docs as (
    select distinct
      si.id,
      token
    from standardized_ingredients si
    cross join lateral regexp_split_to_table(
      regexp_replace(lower(si.canonical_name), '[^a-z0-9 ]', ' ', 'g'),
      '\s+'
    ) as token
    where si.canonical_name is not null
      and si.canonical_name <> ''
      and length(token) > 1
  ),
  freqs as (
    select token, count(*)::integer as doc_freq
    from token_docs
    group by token
  )
  select
    token,
    v_document_count,
    doc_freq,
    ln((v_document_count + 1)::numeric / (doc_freq + 1)::numeric),
    now()
  from freqs;

  return v_document_count;
end;
$$;

create or replace function fn_get_canonical_token_idf()
returns table (
  document_count integer,
  token text,
  doc_freq integer
)
language sql
stable
as $$
  select document_count, token, doc_freq
  from ingredient_token_idf_cache
  order by token;
$$;

select fn_refresh_ingredient_token_idf_cache();

create or replace function fn_match_ingredient_fuzzy_idf(
  p_query text,
  p_top_k integer default 10,
  p_context text default 'scraper'
)
returns table (
  id uuid,
  canonical_name text,
  category text,
  score numeric,
  head_noun_match boolean,
  form_match boolean,
  word_ratio numeric
)
language sql
stable
as $$
  with query_norm as (
    select regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9 ]', ' ', 'g') as value
  ),
  query_tokens as (
    select distinct token
    from query_norm
    cross join lateral regexp_split_to_table(value, '\s+') as token
    where length(token) > 1
  ),
  query_stats as (
    select
      coalesce(array_agg(token), array[]::text[]) as tokens,
      greatest(count(*), 1)::numeric as token_count
    from query_tokens
  ),
  candidates as (
    select
      si.id,
      si.canonical_name,
      si.category::text as category,
      similarity(si.canonical_name, p_query) as trgm_sim,
      coalesce(sum(itic.idf_weight) filter (where si.canonical_name ilike '%' || itic.token || '%'), 0) as idf_score,
      (
        select count(*)::numeric
        from query_tokens qt
        where si.canonical_name ilike '%' || qt.token || '%'
      ) / greatest(
        array_length(regexp_split_to_array(regexp_replace(lower(si.canonical_name), '[^a-z0-9 ]', ' ', 'g'), '\s+'), 1),
        (select token_count from query_stats)
      ) as word_ratio
    from standardized_ingredients si
    left join ingredient_token_idf_cache itic
      on itic.token in (select token from query_tokens)
    where si.canonical_name % p_query
       or si.search_vector @@ plainto_tsquery('english', p_query)
       or exists (
         select 1
         from query_tokens qt
         where si.canonical_name ilike '%' || qt.token || '%'
       )
    group by si.id, si.canonical_name, si.category
  )
  select
    id,
    canonical_name,
    category,
    round((0.5 * trgm_sim + 0.3 * least(idf_score, 1) + 0.2 * word_ratio)::numeric, 4) as score,
    split_part(canonical_name, ' ', 1) = split_part(lower(p_query), ' ', 1) as head_noun_match,
    canonical_name ~* '\m(paste|sauce|oil|vinegar|powder|flour|soup|broth|stock)\M'
      and p_query ~* '\m(paste|sauce|oil|vinegar|powder|flour|soup|broth|stock)\M' as form_match,
    round(word_ratio::numeric, 4) as word_ratio
  from candidates
  order by score desc, canonical_name asc
  limit greatest(1, least(p_top_k, 50));
$$;

create table if not exists ingredient_minhash_signatures (
  canonical_id uuid primary key references standardized_ingredients(id) on delete cascade,
  signature integer[] not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_ingredient_minhash_signatures_updated_at
  on ingredient_minhash_signatures (updated_at desc);

create or replace function fn_match_ingredient_minhash(
  p_signature integer[],
  p_top_k integer default 10
)
returns table (
  id uuid,
  canonical_name text,
  category text,
  jaccard_estimate numeric
)
language sql
stable
as $$
  select
    s.canonical_id as id,
    si.canonical_name,
    si.category::text as category,
    round((
      select count(*)::numeric
      from generate_subscripts(p_signature, 1) i
      where i <= array_length(s.signature, 1)
        and p_signature[i] = s.signature[i]
    ) / greatest(array_length(p_signature, 1), 1), 4) as jaccard_estimate
  from ingredient_minhash_signatures s
  join standardized_ingredients si on si.id = s.canonical_id
  order by jaccard_estimate desc, si.canonical_name asc
  limit greatest(1, least(p_top_k, 50));
$$;
