import { randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import express from "express";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import multer from "multer";
import { csvTemplates, parseMarketCsv } from "./market-data.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticDirectory = path.resolve(currentDirectory, "..");
const sessionCookieName = "thuso.sid";
const bcryptRounds = 12;
const passwordMinimumLength = 12;
const pgSession = connectPgSimple(session);
const regenerateSession = promisify((currentSession, callback) => currentSession.regenerate(callback));

function sendError(response, status, message) {
  response.status(status).json({ error: message });
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function validateStringList(value, field) {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error(`${field} must be a list with at most 30 entries.`);
  }
  return [...new Set(value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 120) {
      throw new Error(`${field} entries must be non-empty and no longer than 120 characters.`);
    }
    return item.trim();
  }))];
}

function validateProfile(body) {
  const skills = Array.isArray(body.skills) ? body.skills : [];
  if (skills.length > 50) throw new Error("skills must contain at most 50 entries.");
  const allowedProficiency = new Set(["beginner", "developing", "proficient", "advanced"]);
  const cleanedSkills = skills.map((skill) => {
    if (!skill || typeof skill.name !== "string" || !skill.name.trim() || skill.name.trim().length > 80) {
      throw new Error("Each skill must have a name no longer than 80 characters.");
    }
    const proficiency = skill.proficiency ?? "developing";
    if (!allowedProficiency.has(proficiency)) throw new Error("Skill proficiency is invalid.");
    return { name: skill.name.trim(), proficiency };
  });
  const displayName = String(body.displayName ?? "").trim();
  if (!displayName || displayName.length > 100) throw new Error("displayName is required and must not exceed 100 characters.");
  return {
    displayName,
    skills: cleanedSkills,
    qualifications: validateStringList(body.qualifications ?? [], "qualifications"),
    interests: validateStringList(body.interests ?? [], "interests"),
    careerGoals: validateStringList(body.careerGoals ?? [], "careerGoals"),
  };
}

function requireCsrf(request, response, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  const expected = request.session.csrfToken;
  const supplied = request.get("x-csrf-token");
  if (!expected || !supplied) return sendError(response, 403, "Your security token is missing. Refresh and try again.");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return sendError(response, 403, "Your security token is invalid. Refresh and try again.");
  }
  return next();
}

function requireUser(request, response, next) {
  if (!request.session.userId) return sendError(response, 401, "Sign in to continue.");
  return next();
}

function requireAdmin(request, response, next) {
  if (!request.session.userId) return sendError(response, 401, "Sign in to continue.");
  if (request.session.role !== "admin") return sendError(response, 403, "Administrator access is required.");
  return next();
}

function validateRegistration(body) {
  const displayName = String(body.displayName ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!displayName || displayName.length > 100) throw new Error("Enter a name up to 100 characters.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (password.length < passwordMinimumLength || password.length > 128) {
    throw new Error(`Password must be between ${passwordMinimumLength} and 128 characters.`);
  }
  return { displayName, email, password };
}

async function sessionUser(pool, userId) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.role,
            COALESCE(p.qualifications, '{}') AS qualifications,
            COALESCE(p.interests, '{}') AS interests,
            COALESCE(p.career_goals, '{}') AS "careerGoals",
            COALESCE(
              json_agg(json_build_object('name', s.skill, 'proficiency', s.proficiency))
                FILTER (WHERE s.skill IS NOT NULL),
              '[]'
            ) AS skills
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_skills s ON s.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, p.qualifications, p.interests, p.career_goals`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function writeProfile(client, userId, profile) {
  await client.query(
    `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
    [userId, profile.displayName],
  );
  await client.query(
    `INSERT INTO user_profiles (user_id, qualifications, interests, career_goals, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id) DO UPDATE SET qualifications = EXCLUDED.qualifications,
       interests = EXCLUDED.interests, career_goals = EXCLUDED.career_goals, updated_at = now()`,
    [userId, profile.qualifications, profile.interests, profile.careerGoals],
  );
  await client.query("DELETE FROM user_skills WHERE user_id = $1", [userId]);
  for (const skill of profile.skills) {
    await client.query(
      `INSERT INTO user_skills (user_id, skill, normalized_skill, proficiency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, normalized_skill) DO UPDATE SET skill = EXCLUDED.skill, proficiency = EXCLUDED.proficiency`,
      [userId, skill.name, skill.name.toLowerCase(), skill.proficiency],
    );
  }
}

async function queryRecommendations(pool, userId) {
  const result = await pool.query(
    `WITH profile_skills AS (
       SELECT normalized_skill FROM user_skills WHERE user_id = $1
     ), profile_context AS (
       SELECT lower(context.term) AS term
         FROM user_profiles p, unnest(p.qualifications || p.interests || p.career_goals) AS context(term)
        WHERE p.user_id = $1
     ), roles AS (
       SELECT min(jp.title) AS title, min(jp.sector) AS sector, count(DISTINCT jp.id)::int AS vacancies,
              count(DISTINCT js.normalized_skill) FILTER (WHERE profile_skills.normalized_skill IS NOT NULL)::int AS matched,
              count(DISTINCT js.normalized_skill)::int AS required,
              array_agg(DISTINCT js.skill) FILTER (WHERE js.normalized_skill IS NOT NULL) AS required_skills,
              array_agg(DISTINCT js.skill) FILTER (WHERE js.normalized_skill IS NOT NULL AND profile_skills.normalized_skill IS NULL) AS missing_skills
         FROM job_postings jp
         LEFT JOIN job_skills js ON js.job_id = jp.id
         LEFT JOIN profile_skills ON profile_skills.normalized_skill = js.normalized_skill
        GROUP BY lower(jp.title)
     )
     SELECT title, sector, vacancies, matched, required,
            LEAST(100, COALESCE(round(80.0 * matched / NULLIF(required, 0)), 0) +
              CASE WHEN EXISTS (
                SELECT 1 FROM profile_context
                 WHERE length(term) >= 3
                   AND (strpos(lower(title), term) > 0 OR strpos(lower(sector), term) > 0)
              ) THEN 20 ELSE 0 END)::int AS suitability,
            COALESCE(required_skills, '{}') AS skills,
            COALESCE(missing_skills, '{}') AS missing_skills
       FROM roles ORDER BY suitability DESC, vacancies DESC LIMIT 20`,
    [userId],
  );
  return result.rows;
}

export function createApp({
  pool,
  sessionSecret = process.env.SESSION_SECRET,
  sessionStore,
  production = process.env.NODE_ENV === "production",
  secureCookies = process.env.SESSION_COOKIE_SECURE === undefined
    ? production
    : process.env.SESSION_COOKIE_SECURE === "true",
}) {
  if (!pool) throw new Error("A PostgreSQL pool is required.");
  if (typeof sessionSecret !== "string" || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: "64kb" }));
  app.use(session({
    name: sessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore ?? new pgSession({ pool, createTableIfMissing: true }),
    cookie: {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", requireCsrf);

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
  const importLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!file.originalname.toLowerCase().endsWith(".csv") || !["text/csv", "application/vnd.ms-excel", "application/csv"].includes(file.mimetype)) {
        callback(new Error("Upload a CSV file."));
        return;
      }
      callback(null, true);
    },
  });

  app.get("/api/health", async (_request, response, next) => {
    try {
      await pool.query("SELECT 1");
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/csrf", (request, response) => {
    request.session.csrfToken ??= randomBytes(32).toString("hex");
    response.set("Cache-Control", "no-store");
    response.json({ csrfToken: request.session.csrfToken });
  });

  app.post("/api/auth/register", authLimiter, async (request, response, next) => {
    let details;
    try {
      details = validateRegistration(request.body);
    } catch (error) {
      return sendError(response, 400, error.message);
    }
    const client = await pool.connect().catch(next);
    if (!client) return;
    try {
      const passwordHash = await bcrypt.hash(details.password, bcryptRounds);
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING id`,
        [details.email, passwordHash, details.displayName],
      );
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return sendError(response, 409, "An account with this email already exists.");
      }
      const userId = inserted.rows[0].id;
      await client.query("INSERT INTO user_profiles (user_id) VALUES ($1)", [userId]);
      await client.query("COMMIT");
      await regenerateSession(request.session);
      request.session.userId = userId;
      request.session.role = "user";
      response.status(201).json({ user: await sessionUser(pool, userId) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.post("/api/auth/login", authLimiter, async (request, response, next) => {
    const email = normalizeEmail(request.body.email);
    const password = String(request.body.password ?? "");
    if (!email || !password || email.length > 254 || password.length > 128) {
      return sendError(response, 400, "Enter your email and password.");
    }
    try {
      const result = await pool.query(
        "SELECT id, password_hash, role FROM users WHERE lower(email) = $1",
        [email],
      );
      const user = result.rows[0];
      const matches = await bcrypt.compare(password, user?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
      if (!user || !matches) return sendError(response, 401, "Email or password is incorrect.");
      await regenerateSession(request.session);
      request.session.userId = user.id;
      request.session.role = user.role;
      response.json({ user: await sessionUser(pool, user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", requireUser, (request, response, next) => {
    request.session.destroy((error) => {
      if (error) return next(error);
      response.clearCookie(sessionCookieName, { httpOnly: true, secure: secureCookies, sameSite: "lax" });
      response.status(204).end();
    });
  });

  app.get("/api/auth/me", async (request, response, next) => {
    if (!request.session.userId) return response.json({ user: null });
    try {
      const user = await sessionUser(pool, request.session.userId);
      if (!user) {
        request.session.destroy(() => {});
        return response.json({ user: null });
      }
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/profile", requireUser, async (request, response, next) => {
    try {
      const profile = await sessionUser(pool, request.session.userId);
      if (!profile) return sendError(response, 404, "Profile not found.");
      response.json({ profile });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/profile", requireUser, async (request, response, next) => {
    let profile;
    try {
      profile = validateProfile(request.body);
    } catch (error) {
      return sendError(response, 400, error.message);
    }
    const client = await pool.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      await writeProfile(client, request.session.userId, profile);
      await client.query("COMMIT");
      response.json({ profile: await sessionUser(pool, request.session.userId) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.get("/api/saved-insights", requireUser, async (request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT insight_key AS id, title, description
           FROM saved_insights WHERE user_id = $1 ORDER BY created_at DESC`,
        [request.session.userId],
      );
      response.json({ insights: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/saved-insights/:id", requireUser, async (request, response, next) => {
    const id = String(request.params.id);
    const { title, description } = request.body;
    if (!/^[a-z0-9-]{1,100}$/.test(id) || typeof title !== "string" || !title.trim() || title.length > 150 || typeof description !== "string" || description.length > 1000) {
      return sendError(response, 400, "The saved insight is invalid.");
    }
    try {
      const result = await pool.query(
        `INSERT INTO saved_insights (user_id, insight_key, title, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, insight_key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
         RETURNING insight_key AS id, title, description`,
        [request.session.userId, id, title.trim(), description],
      );
      response.status(201).json({ insight: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/saved-insights/:id", requireUser, async (request, response, next) => {
    try {
      await pool.query("DELETE FROM saved_insights WHERE user_id = $1 AND insight_key = $2", [request.session.userId, request.params.id]);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/market/summary", async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT count(*)::int AS vacancies,
                count(DISTINCT sector)::int AS sectors,
                count(DISTINCT lower(title))::int AS occupations,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_monthly)) AS median_salary,
                count(DISTINCT source_name)::int AS sources,
                COALESCE(round(
                  100.0 * (count(*) FILTER (WHERE posted_at >= current_date - interval '12 months') -
                  count(*) FILTER (WHERE posted_at >= current_date - interval '24 months' AND posted_at < current_date - interval '12 months')) /
                  NULLIF(count(*) FILTER (WHERE posted_at >= current_date - interval '24 months' AND posted_at < current_date - interval '12 months'), 0), 1
                ), 0) AS annual_change
           FROM job_postings`,
      );
      response.json({ summary: result.rows[0], illustrative: result.rows[0].vacancies === 0 });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/market/trends", async (request, response, next) => {
    const months = Number(request.query.months ?? 12);
    if (!Number.isInteger(months) || ![6, 12, 24, 36, 60].includes(months)) return sendError(response, 400, "Choose a supported trend period.");
    try {
      const result = await pool.query(
        `SELECT date_trunc('month', posted_at)::date AS month, sector, count(*)::int AS vacancies
           FROM job_postings
          WHERE posted_at >= date_trunc('month', current_date) - ($1::int * interval '1 month')
          GROUP BY 1, 2 ORDER BY 1, 2`,
        [months],
      );
      response.json({ months: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/market/skills", async (_request, response, next) => {
    try {
      const result = await pool.query(
        `WITH totals AS (
           SELECT NULLIF(count(*), 0) AS total,
                  NULLIF(count(*) FILTER (WHERE posted_at >= current_date - interval '90 days'), 0) AS recent_total,
                  NULLIF(count(*) FILTER (WHERE posted_at >= current_date - interval '180 days'
                    AND posted_at < current_date - interval '90 days'), 0) AS previous_total
             FROM job_postings
         ),
         demand AS (
           SELECT js.normalized_skill, min(js.skill) AS skill, count(DISTINCT js.job_id)::int AS postings,
                  round(100.0 * count(DISTINCT js.job_id) / totals.total, 1) AS demand_percent,
                  count(DISTINCT js.job_id) FILTER (WHERE jp.posted_at >= current_date - interval '90 days') AS recent_postings,
                  count(DISTINCT js.job_id) FILTER (WHERE jp.posted_at >= current_date - interval '180 days'
                    AND jp.posted_at < current_date - interval '90 days') AS previous_postings,
                  totals.recent_total,
                  totals.previous_total
             FROM job_skills js CROSS JOIN totals
             JOIN job_postings jp ON jp.id = js.job_id
            GROUP BY js.normalized_skill, totals.total, totals.recent_total, totals.previous_total
         )
         SELECT skill, postings, demand_percent, count(*) OVER ()::int AS skill_count,
                CASE WHEN previous_postings = 0 THEN 0
                  ELSE round(100.0 * (recent_postings - previous_postings) / previous_postings, 1)
                END AS change_percent,
                CASE WHEN recent_total IS NULL THEN 'unclassified'
                  WHEN recent_postings = 0 THEN 'declining'
                  WHEN previous_postings = 0 THEN 'emerging'
                  WHEN recent_postings > previous_postings THEN 'growing'
                  WHEN recent_postings < previous_postings THEN 'declining'
                  ELSE 'steady'
                END AS trend
           FROM demand
          ORDER BY postings DESC, skill LIMIT 50`,
      );
      response.json({ skills: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/market/employers", async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT company AS name, sector, count(*)::int AS vacancies
           FROM job_postings GROUP BY company, sector ORDER BY vacancies DESC, company LIMIT 50`,
      );
      response.json({ employers: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/market/training", async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT id, name, location, offerings FROM training_providers ORDER BY name LIMIT 100`,
      );
      response.json({ providers: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/recommendations", requireUser, async (request, response, next) => {
    try {
      response.json({ recommendations: await queryRecommendations(pool, request.session.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skills-gap", requireUser, async (request, response, next) => {
    try {
      const recommendations = await queryRecommendations(pool, request.session.userId);
      const selectedRole = typeof request.query.role === "string"
        ? recommendations.find((role) => role.title.toLowerCase() === request.query.role.toLowerCase())
        : recommendations[0];
      if (!selectedRole) return response.json({ report: null, training: [] });
      const training = selectedRole.missing_skills.length
        ? await pool.query(
          `SELECT id, name, location, offerings FROM training_providers
            WHERE EXISTS (
              SELECT 1               FROM unnest(offerings) AS items(offering)
               WHERE lower(items.offering) = ANY($1::text[])
            )
            ORDER BY name LIMIT 20`,
          [selectedRole.missing_skills.map((skill) => skill.toLowerCase())],
        )
        : { rows: [] };
      response.json({
        report: {
          role: selectedRole.title,
          suitability: selectedRole.suitability,
          requiredSkills: selectedRole.skills,
          missingSkills: selectedRole.missing_skills,
        },
        training: training.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/template/:kind.csv", requireAdmin, (request, response) => {
    const template = csvTemplates[request.params.kind];
    if (!template) return sendError(response, 404, "Template not found.");
    response.type("text/csv").attachment(`thuso-${request.params.kind}-template.csv`).send(template);
  });

  app.get("/api/admin/imports", requireAdmin, async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT di.id, di.filename, di.records_inserted AS inserted,
                di.records_updated AS updated, di.imported_at AS "importedAt",
                u.email AS "importedBy"
           FROM dataset_imports di JOIN users u ON u.id = di.admin_user_id
          ORDER BY di.imported_at DESC LIMIT 100`,
      );
      response.json({ imports: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/overview", requireAdmin, async (_request, response, next) => {
    try {
      const result = await pool.query(
        `SELECT (SELECT count(*)::int FROM users) AS users,
                (SELECT count(*)::int FROM job_postings) AS job_postings,
                (SELECT count(*)::int FROM training_providers) AS training_providers,
                (SELECT count(*)::int FROM dataset_imports) AS imports,
                (SELECT count(*)::int FROM dataset_imports WHERE imported_at >= now() - interval '30 days') AS imports_last_30_days`,
      );
      response.json({
        overview: result.rows[0],
        databasePool: {
          total: Number.isInteger(pool.totalCount) ? pool.totalCount : null,
          idle: Number.isInteger(pool.idleCount) ? pool.idleCount : null,
          waiting: Number.isInteger(pool.waitingCount) ? pool.waitingCount : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/imports", requireAdmin, importLimiter, upload.single("file"), async (request, response, next) => {
    if (!request.file) return sendError(response, 400, "Choose a CSV file to upload.");
    let records;
    try {
      records = parseMarketCsv(request.file.buffer);
    } catch (error) {
      return sendError(response, 400, error.message);
    }

    const client = await pool.connect().catch(next);
    if (!client) return;
    let insertedCount = 0;
    let updatedCount = 0;
    try {
      await client.query("BEGIN");
      for (const record of records) {
        if (record.type === "job") {
          const conflictTarget = record.sourceUrl
            ? "ON CONFLICT (source_url) WHERE source_url IS NOT NULL"
            : "ON CONFLICT (lower(title), lower(company), posted_at) WHERE source_url IS NULL";
          const result = await client.query(
            `INSERT INTO job_postings (title, company, sector, location, source_name, posted_at, salary_monthly, source_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ${conflictTarget} DO UPDATE SET
               title = EXCLUDED.title, company = EXCLUDED.company, sector = EXCLUDED.sector,
               location = EXCLUDED.location, source_name = EXCLUDED.source_name,
               posted_at = EXCLUDED.posted_at, salary_monthly = EXCLUDED.salary_monthly
             RETURNING id, (xmax = 0) AS inserted`,
            [record.title, record.company, record.sector, record.location, record.sourceName, record.postedAt, record.salaryMonthly, record.sourceUrl],
          );
          const job = result.rows[0];
          if (job.inserted) insertedCount += 1;
          else updatedCount += 1;
          await client.query("DELETE FROM job_skills WHERE job_id = $1", [job.id]);
          for (const skill of record.skills) {
            await client.query(
              "INSERT INTO job_skills (job_id, skill, normalized_skill) VALUES ($1, $2, $3)",
              [job.id, skill, skill.toLowerCase()],
            );
          }
        } else {
          const conflictTarget = record.sourceUrl
            ? "ON CONFLICT (source_url) WHERE source_url IS NOT NULL"
            : "ON CONFLICT (lower(name), lower(location)) WHERE source_url IS NULL";
          const result = await client.query(
            `INSERT INTO training_providers (name, location, offerings, source_url)
             VALUES ($1, $2, $3, $4)
             ${conflictTarget} DO UPDATE SET
               name = EXCLUDED.name, location = EXCLUDED.location, offerings = EXCLUDED.offerings, updated_at = now()
             RETURNING (xmax = 0) AS inserted`,
            [record.name, record.location, record.offerings, record.sourceUrl],
          );
          if (result.rows[0].inserted) insertedCount += 1;
          else updatedCount += 1;
        }
      }
      await client.query(
        `INSERT INTO dataset_imports (admin_user_id, filename, records_inserted, records_updated)
         VALUES ($1, $2, $3, $4)`,
        [request.session.userId, path.basename(request.file.originalname), insertedCount, updatedCount],
      );
      await client.query("COMMIT");
      response.status(201).json({ imported: records.length, inserted: insertedCount, updated: updatedCount });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.use("/api", (_request, response) => sendError(response, 404, "API endpoint not found."));
  app.get("/", (_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
  app.get("/index.html", (_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
  app.get("/styles.css", (_request, response) => {
    response.set("Cache-Control", production ? "public, max-age=3600" : "no-store");
    response.sendFile(path.join(staticDirectory, "styles.css"));
  });
  app.get("/app.js", (_request, response) => {
    response.set("Cache-Control", production ? "public, max-age=3600" : "no-store");
    response.sendFile(path.join(staticDirectory, "app.js"));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) {
      return sendError(response, error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.code === "LIMIT_FILE_SIZE" ? "CSV files cannot exceed 2 MB." : "The upload could not be processed.");
    }
    if (error.message === "Upload a CSV file.") return sendError(response, 400, error.message);
    console.error("Request failed.", error);
    return sendError(response, 500, "The request could not be completed. Please try again.");
  });

  return app;
}

export { validateProfile, validateRegistration };
