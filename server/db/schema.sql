CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  qualifications TEXT[] NOT NULL DEFAULT '{}',
  interests TEXT[] NOT NULL DEFAULT '{}',
  career_goals TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  normalized_skill TEXT NOT NULL,
  proficiency TEXT NOT NULL DEFAULT 'developing'
    CHECK (proficiency IN ('beginner', 'developing', 'proficient', 'advanced')),
  PRIMARY KEY (user_id, normalized_skill)
);

CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  sector TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Botswana',
  source_name TEXT NOT NULL DEFAULT 'Admin CSV import',
  posted_at DATE NOT NULL,
  salary_monthly NUMERIC(12, 2),
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (salary_monthly IS NULL OR salary_monthly >= 0)
);
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'Admin CSV import';

CREATE UNIQUE INDEX IF NOT EXISTS job_postings_source_url_unique
  ON job_postings (source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS job_postings_content_unique
  ON job_postings (lower(title), lower(company), posted_at) WHERE source_url IS NULL;
CREATE INDEX IF NOT EXISTS job_postings_posted_sector_idx
  ON job_postings (posted_at, sector);
CREATE INDEX IF NOT EXISTS job_postings_title_idx ON job_postings (lower(title));

CREATE TABLE IF NOT EXISTS job_skills (
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  normalized_skill TEXT NOT NULL,
  PRIMARY KEY (job_id, normalized_skill)
);
CREATE INDEX IF NOT EXISTS job_skills_normalized_idx ON job_skills (normalized_skill);

CREATE TABLE IF NOT EXISTS training_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Botswana',
  offerings TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS training_providers_source_url_unique
  ON training_providers (source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS training_providers_content_unique
  ON training_providers (lower(name), lower(location)) WHERE source_url IS NULL;

CREATE TABLE IF NOT EXISTS saved_insights (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, insight_key)
);

CREATE TABLE IF NOT EXISTS dataset_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dataset_imports_imported_at_idx ON dataset_imports(imported_at DESC);
