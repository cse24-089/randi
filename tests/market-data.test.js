import test from "node:test";
import assert from "node:assert/strict";
import { parseMarketCsv } from "../server/market-data.js";
import { validateProfile, validateRegistration } from "../server/app.js";

test("parses and normalizes a job posting CSV", () => {
  const records = parseMarketCsv(Buffer.from(
    'record_type,title,company,sector,location,source_name,posted_at,salary_monthly,skills,provider_name,offerings,source_url\n'
    + 'job,Data Analyst,Example Co,Technology,Gaborone,Vacancy feed,2026-01-15,12000,"SQL; Power BI; SQL",,,https://example.org/jobs/1\n',
  ));

  assert.equal(records.length, 1);
  assert.equal(records[0].type, "job");
  assert.equal(records[0].sourceName, "Vacancy feed");
  assert.deepEqual(records[0].skills, ["SQL", "Power BI"]);
});

test("parses provider CSV records", () => {
  const records = parseMarketCsv(Buffer.from(
    "record_type,provider_name,location,offerings,source_url\n"
    + "training,Skills Centre,Gaborone,Data analysis; SQL,https://example.org/training\n",
  ));

  assert.equal(records[0].type, "training");
  assert.deepEqual(records[0].offerings, ["Data analysis", "SQL"]);
});

test("rejects invalid dates, insecure URLs, and unknown record types", () => {
  const headers = "record_type,title,company,sector,location,source_name,posted_at,salary_monthly,skills,provider_name,offerings,source_url\n";
  assert.throws(
    () => parseMarketCsv(Buffer.from(`${headers}job,Role,Co,Tech,Gaborone,Feed,2026-02-31,,SQL,,,\n`)),
    /posted_at must use YYYY-MM-DD/,
  );
  assert.throws(
    () => parseMarketCsv(Buffer.from(`${headers}job,Role,Co,Tech,Gaborone,Feed,2026-02-28,,SQL,,,http:\/\/example.org\/job\n`)),
    /source_url must use HTTPS/,
  );
  assert.throws(
    () => parseMarketCsv(Buffer.from(`${headers}other,,,,,,,,,,,\n`)),
    /record_type must be either/,
  );
});

test("validates registration credentials and profile fields", () => {
  const registration = validateRegistration({
    displayName: "T. User",
    email: "  USER@example.org ",
    password: "a-secure-password",
  });
  assert.equal(registration.email, "user@example.org");
  assert.throws(() => validateRegistration({
    displayName: "User",
    email: "user@example.org",
    password: "short",
  }), /Password must be between/);

  const profile = validateProfile({
    displayName: "T. User",
    skills: [{ name: "SQL", proficiency: "proficient" }],
    qualifications: ["BSc"],
    interests: ["Analytics"],
    careerGoals: ["Data analyst"],
  });
  assert.deepEqual(profile.skills[0], { name: "SQL", proficiency: "proficient" });
  assert.deepEqual(profile.careerGoals, ["Data analyst"]);
  assert.throws(() => validateProfile({ displayName: "User", skills: [{ name: "SQL", proficiency: "expert" }] }), /proficiency is invalid/);
});
