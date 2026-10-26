import { parse } from "csv-parse/sync";

const commonHeaders = ["record_type", "source_url"];
const jobHeaders = ["title", "company", "sector", "location", "source_name", "posted_at", "salary_monthly", "skills"];
const trainingHeaders = ["provider_name", "location", "offerings"];
const maximumRows = 10000;
const maximumTextLength = 180;

function cleanText(value, field, { optional = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text && optional) return null;
  if (!text || text.length > maximumTextLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`${field} is required and must be at most ${maximumTextLength} characters.`);
  }
  return text;
}

function parseList(value, field) {
  const entries = String(value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length > 40 || entries.some((entry) => entry.length > 80)) {
    throw new Error(`${field} must contain at most 40 values, each no longer than 80 characters.`);
  }
  return [...new Set(entries)];
}

function validateSourceUrl(value) {
  const sourceUrl = cleanText(value, "source_url", { optional: true });
  if (!sourceUrl) return null;
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("source_url must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("source_url must use HTTPS.");
  return parsed.toString();
}

export function parseMarketCsv(buffer) {
  const rows = parse(buffer, {
    bom: true,
    columns: (headers) => headers.map((header) => header.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    max_record_size: 10000,
    relax_column_count: false,
  });

  if (!rows.length) throw new Error("The CSV file has no data rows.");
  if (rows.length > maximumRows) throw new Error(`The CSV file cannot exceed ${maximumRows} rows.`);

  const headers = new Set(Object.keys(rows[0]));
  for (const header of commonHeaders) {
    if (!headers.has(header)) throw new Error(`Missing required CSV column: ${header}.`);
  }

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    try {
      const recordType = cleanText(row.record_type, "record_type").toLowerCase();
      const sourceUrl = validateSourceUrl(row.source_url);

      if (recordType === "job") {
        for (const header of jobHeaders) {
          if (!headers.has(header)) throw new Error(`Missing required CSV column: ${header}.`);
        }
        const postedAt = cleanText(row.posted_at, "posted_at");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(postedAt)
          || Number.isNaN(Date.parse(`${postedAt}T00:00:00Z`))
          || new Date(`${postedAt}T00:00:00Z`).toISOString().slice(0, 10) !== postedAt
        ) {
          throw new Error("posted_at must use YYYY-MM-DD format.");
        }
        const salary = String(row.salary_monthly ?? "").trim();
        const salaryMonthly = salary ? Number(salary) : null;
        if (salaryMonthly !== null && (!Number.isFinite(salaryMonthly) || salaryMonthly < 0 || salaryMonthly > 100000000)) {
          throw new Error("salary_monthly must be a positive amount no greater than 100000000.");
        }
        return {
          rowNumber,
          type: "job",
          title: cleanText(row.title, "title"),
          company: cleanText(row.company, "company"),
          sector: cleanText(row.sector, "sector"),
          location: cleanText(row.location, "location"),
          sourceName: cleanText(row.source_name, "source_name"),
          postedAt,
          salaryMonthly,
          sourceUrl,
          skills: parseList(row.skills, "skills"),
        };
      }

      if (recordType === "training") {
        for (const header of trainingHeaders) {
          if (!headers.has(header)) throw new Error(`Missing required CSV column: ${header}.`);
        }
        return {
          rowNumber,
          type: "training",
          name: cleanText(row.provider_name, "provider_name"),
          location: cleanText(row.location, "location"),
          sourceUrl,
          offerings: parseList(row.offerings, "offerings"),
        };
      }

      throw new Error('record_type must be either "job" or "training".');
    } catch (error) {
      throw new Error(`CSV row ${rowNumber}: ${error.message}`);
    }
  });
}

export const csvTemplates = {
  jobs: "record_type,title,company,sector,location,source_name,posted_at,salary_monthly,skills,provider_name,offerings,source_url\njob,Data Analyst,Example Employer,Technology,Gaborone,Public vacancy feed,2026-01-15,12000,\"SQL; Power BI\",,,https://example.org/jobs/1\n",
  training: "record_type,provider_name,location,offerings,source_url\ntraining,Example Training Centre,Gaborone,\"SQL; Data analysis\",https://example.org/training\n",
};
