alter table public.profiles
  drop column if exists tutorial_path,
  drop column if exists tutorial_goals_ranking;
