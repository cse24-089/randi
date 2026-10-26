const roles = {
  "data-analyst": {
    title: "Data analyst",
    summary: "Growing demand across finance, retail, and public services.",
    outlook: "Strong demand",
    match: 78,
    skills: ["Data analysis", "SQL", "Power BI", "Statistics"],
  },
  "software-developer": {
    title: "Software developer",
    summary: "Digital transformation is creating opportunities across sectors.",
    outlook: "Very strong demand",
    match: 84,
    skills: ["JavaScript", "Cloud", "APIs", "Problem solving"],
  },
  accountant: {
    title: "Accountant",
    summary: "Steady hiring across financial services and growing businesses.",
    outlook: "Steady demand",
    match: 72,
    skills: ["Financial reporting", "Excel", "Tax", "Attention to detail"],
  },
  nurse: {
    title: "Registered nurse",
    summary: "Healthcare remains essential, with demand in clinical and community care.",
    outlook: "Strong demand",
    match: 81,
    skills: ["Patient care", "Clinical practice", "Communication", "Triage"],
  },
  "project-manager": {
    title: "Project manager",
    summary: "Employers value people who can deliver complex work across teams.",
    outlook: "Growing demand",
    match: 75,
    skills: ["Project management", "Agile", "Leadership", "Planning"],
  },
};
const liveRoles = new Map();
let liveTrendRows = [];

const roleSelect = document.querySelector("#role-select");
const roleTitle = document.querySelector("#role-title");
const roleSummary = document.querySelector("#role-summary");
const roleSkills = document.querySelector("#role-skills");
const matchValue = document.querySelector("#match-value");
const matchBar = document.querySelector("#match-bar");
const outlookLabel = document.querySelector("#outlook-label");
const toast = document.querySelector("#toast");
const actionDialog = document.querySelector("#action-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogContent = document.querySelector("#dialog-content");
let toastTimer;
const savedInsights = new Map();
let currentUser = null;
let csrfToken = null;
let hasImportedMarketData = false;

async function apiRequest(url, options = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers ?? {});
  if (method !== "GET" && method !== "HEAD") {
    if (!csrfToken) {
      const csrfResponse = await fetch("/api/csrf", { credentials: "same-origin" });
      if (!csrfResponse.ok) throw new Error("Could not initialize a secure session. Check that Thuso is running on its application server.");
      csrfToken = (await csrfResponse.json()).csrfToken;
    }

    headers.set("X-CSRF-Token", csrfToken);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...options, method, headers, credentials: "same-origin" });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  return payload;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function updateRole() {
  const role = getSelectedRole();
  if (!role) return;
  roleTitle.textContent = role.title;
  roleSummary.textContent = role.summary;
  outlookLabel.textContent = role.outlook;
  matchValue.textContent = `${role.match}%`;
  matchBar.style.width = `${role.match}%`;
  roleSkills.replaceChildren(
    ...role.skills.map((skill) => {
      const chip = document.createElement("span");
      chip.className = "role-skill-chip";
      chip.textContent = skill;
      return chip;
    }),
  );
}

roleSelect.addEventListener("change", updateRole);
updateRole();

function syncNavigation(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  const link = document.querySelector(`.nav-link[href="#${sectionId}"]`);
  document.querySelectorAll(".nav-link").forEach((item) => {
    const isActive = item === link;
    item.classList.toggle("active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelector("#page-heading").textContent = link?.dataset.view ?? target.querySelector("h2")?.textContent ?? "Overview";
  return target;
}

function navigateTo(sectionId) {
  const target = syncNavigation(sectionId);
  if (!target) return;
  history.pushState(null, "", `#${sectionId}`);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncNavigationFromUrl() {
  const requestedSection = window.location.hash.slice(1) || "overview";
  syncNavigation(document.getElementById(requestedSection) ? requestedSection : "overview");
}

window.addEventListener("popstate", syncNavigationFromUrl);
window.addEventListener("hashchange", syncNavigationFromUrl);
syncNavigationFromUrl();

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo(link.getAttribute("href").slice(1));
  });
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.jump);
  });
});

function getSelectedRole() {
  return liveRoles.get(roleSelect.value) ?? roles[roleSelect.value];
}

function updateSavedInsights() {
  const savedList = document.querySelector("#saved-list");
  const savedCount = document.querySelector(".nav-count");
  savedCount.textContent = savedInsights.size;
  savedList.replaceChildren();

  if (!savedInsights.size) {
    const empty = document.createElement("p");
    empty.className = "saved-empty";
    empty.textContent = "No saved insights yet. Save a skill set or career pathway to see it here.";
    savedList.append(empty);
    return;
  }

  savedInsights.forEach((insight, id) => {
    const item = document.createElement("div");
    item.className = "saved-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const description = document.createElement("span");
    title.textContent = insight.title;
    description.textContent = insight.description;
    details.append(title, description);
    const removeButton = document.createElement("button");
    removeButton.className = "text-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      saveInsight(id, insight.title, insight.description).catch(showApiError);
    });
    item.append(details, removeButton);
    savedList.append(item);
  });
}

async function saveInsight(id, title, description) {
  if (!currentUser) {
    openAuthDialog();
    showToast("Sign in to save insights to your account.");
    return;
  }
  if (savedInsights.has(id)) {
    await apiRequest(`/api/saved-insights/${encodeURIComponent(id)}`, { method: "DELETE" });
    savedInsights.delete(id);
    showToast(`${title} removed from saved insights.`);
  } else {
    const result = await apiRequest(`/api/saved-insights/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ title, description }),
    });
    savedInsights.set(id, result.insight);
    showToast(`${title} added to saved insights.`);
  }
  updateSavedInsights();
  updateSaveButtons();
}

function updateSaveButtons() {
  document.querySelector("#save-skills-button").textContent = savedInsights.has("skills")
    ? "Saved · remove"
    : "Save skills";
  document.querySelector("#save-pathway-button").textContent = savedInsights.has(`pathway-${roleSelect.value}`)
    ? "Saved · remove"
    : "Save pathway";
}

function showApiError(error) {
  console.error("Thuso request failed.", error);
  showToast(error.message || "The request could not be completed.");
}

function openDialog(title, contentBuilder) {
  dialogTitle.textContent = title;
  dialogContent.replaceChildren();
  contentBuilder(dialogContent);
  if (!actionDialog.open) actionDialog.showModal();
}

function addDialogParagraph(container, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  container.append(paragraph);
}

function addDialogButton(container, label, action, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "button button-primary" : "button button-outline";
  button.textContent = label;
  button.addEventListener("click", action);
  container.append(button);
}

function addFormField(form, { label, name, value = "", type = "text", required = false, autocomplete }) {
  const field = document.createElement("label");
  field.className = "form-field";
  field.textContent = label;
  const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  input.name = name;
  if (type !== "textarea") input.type = type;
  input.value = value;
  input.required = required;
  if (autocomplete) input.autocomplete = autocomplete;
  field.append(input);
  form.append(field);
  return input;
}

function splitProfileList(value) {
  return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
}

function updateAccountChrome() {
  const profileName = document.querySelector(".profile-copy strong");
  const profileType = document.querySelector(".profile-copy span");
  document.querySelector(".avatar").textContent = currentUser?.displayName?.slice(0, 1).toUpperCase() ?? "G";
  profileName.textContent = currentUser?.displayName ?? "Guest";
  profileType.textContent = currentUser ? "Career explorer" : "Browsing as guest";
  authToggle.textContent = currentUser ? "My profile" : "Sign in";
  const adminLink = document.querySelector(".admin-nav-link");
  adminLink.hidden = currentUser?.role !== "admin";
  if (!currentUser?.role || currentUser.role !== "admin") {
    document.querySelector("#admin").hidden = true;
  }
}

function openAuthDialog(mode = "login") {
  const render = (selectedMode) => {
    dialogTitle.textContent = selectedMode === "register" ? "Create your Thuso account" : "Sign in to Thuso";
    dialogContent.replaceChildren();
    const form = document.createElement("form");
    form.className = "form-stack";
    if (selectedMode === "register") {
      addFormField(form, { label: "Full name", name: "displayName", required: true, autocomplete: "name" });
    }
    addFormField(form, { label: "Email address", name: "email", type: "email", required: true, autocomplete: "email" });
    addFormField(form, { label: "Password", name: "password", type: "password", required: true, autocomplete: selectedMode === "register" ? "new-password" : "current-password" });
    const submit = document.createElement("button");
    submit.className = "button button-primary";
    submit.type = "submit";
    submit.textContent = selectedMode === "register" ? "Create account" : "Sign in";
    form.append(submit);
    const switchButton = document.createElement("button");
    switchButton.className = "text-button auth-switch";
    switchButton.type = "button";
    switchButton.textContent = selectedMode === "register" ? "Already have an account? Sign in" : "New to Thuso? Create an account";
    switchButton.addEventListener("click", () => render(selectedMode === "register" ? "login" : "register"));
    form.append(switchButton);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      submit.disabled = true;
      try {
        const endpoint = selectedMode === "register" ? "/api/auth/register" : "/api/auth/login";
        const result = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(values) });
        csrfToken = null;
        currentUser = result.user;
        await refreshSavedInsights();
        updateAccountChrome();
        actionDialog.close();
        showToast(`Welcome${currentUser.displayName ? `, ${currentUser.displayName}` : ""}.`);
        loadRecommendations().catch(showApiError);
        if (currentUser.role === "admin") {
          Promise.all([loadImportHistory(), loadAdminOverview()]).catch(showApiError);
        }
      } catch (error) {
        showApiError(error);
        submit.disabled = false;
      }
    });
    dialogContent.append(form);
    if (!actionDialog.open) actionDialog.showModal();
  };
  render(mode);
}

async function refreshSavedInsights() {
  savedInsights.clear();
  if (currentUser) {
    const result = await apiRequest("/api/saved-insights");
    result.insights.forEach((insight) => savedInsights.set(insight.id, insight));
  }
  updateSavedInsights();
  updateSaveButtons();
}

function openProfileDialog() {
  if (!currentUser) {
    openAuthDialog();
    return;
  }
  const render = async () => {
    try {
      const result = await apiRequest("/api/profile");
      const profile = result.profile;
      dialogTitle.textContent = "Your career profile";
      dialogContent.replaceChildren();
      const form = document.createElement("form");
      form.className = "form-stack profile-form";
      addFormField(form, { label: "Display name", name: "displayName", value: profile.displayName, required: true });
      addFormField(form, { label: "Skills (comma-separated)", name: "skills", value: profile.skills.map((skill) => skill.name).join(", ") });
      addFormField(form, { label: "Qualifications (comma-separated)", name: "qualifications", value: profile.qualifications.join(", ") });
      addFormField(form, { label: "Career interests (comma-separated)", name: "interests", value: profile.interests.join(", ") });
      addFormField(form, { label: "Career goals (comma-separated)", name: "careerGoals", value: profile.careerGoals.join(", ") });
      const submit = document.createElement("button");
      submit.className = "button button-primary";
      submit.type = "submit";
      submit.textContent = "Save profile";
      form.append(submit);
      const signOutButton = document.createElement("button");
      signOutButton.className = "button button-outline";
      signOutButton.type = "button";
      signOutButton.textContent = "Sign out";
      signOutButton.addEventListener("click", () => signOut().catch(showApiError));
      form.append(signOutButton);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        const proficiencies = new Map(profile.skills.map((skill) => [skill.name.toLowerCase(), skill.proficiency]));
        try {
          const saved = await apiRequest("/api/profile", {
            method: "PUT",
            body: JSON.stringify({
              displayName: values.displayName,
              skills: splitProfileList(values.skills).map((name) => ({
                name,
                proficiency: proficiencies.get(name.toLowerCase()) ?? "developing",
              })),
              qualifications: splitProfileList(values.qualifications),
              interests: splitProfileList(values.interests),
              careerGoals: splitProfileList(values.careerGoals),
            }),
          });
          currentUser = saved.profile;
          updateAccountChrome();
          await loadRecommendations();
          actionDialog.close();
          showToast("Your profile has been updated.");
        } catch (error) {
          showApiError(error);
        }
      });
      dialogContent.append(form);
      if (!actionDialog.open) actionDialog.showModal();
    } catch (error) {
      showApiError(error);
    }
  };
  render();
}

async function loadImportHistory() {
  const result = await apiRequest("/api/admin/imports");
  const history = document.querySelector("#import-history");
  history.replaceChildren();
  if (!result.imports.length) {
    history.textContent = "No datasets imported yet.";
    return;
  }
  for (const item of result.imports) {
    const row = document.createElement("div");
    row.className = "import-history-row";
    row.textContent = `${item.filename} · ${item.inserted} new · ${item.updated} updated · ${new Date(item.importedAt).toLocaleString()}`;
    history.append(row);
  }
}

async function loadAdminOverview() {
  const result = await apiRequest("/api/admin/overview");
  const container = document.querySelector("#admin-overview");
  const overview = result.overview;
  const metrics = [
    ["Registered accounts", overview.users],
    ["Job postings", overview.job_postings],
    ["Training providers", overview.training_providers],
    ["Total imports", overview.imports],
    ["Imports · last 30 days", overview.imports_last_30_days],
    ["Database connections", result.databasePool.total === null
      ? "Unavailable"
      : `${result.databasePool.total} total · ${result.databasePool.idle} idle`],
    ["Waiting database queries", result.databasePool.waiting ?? "Unavailable"],
  ];
  container.replaceChildren(...metrics.map(([label, value]) => {
    const card = document.createElement("div");
    card.className = "admin-overview-card";
    card.append(document.createTextNode(label));
    const amount = document.createElement("strong");
    amount.textContent = typeof value === "number" ? value.toLocaleString() : String(value);
    card.append(amount);
    return card;
  }));
}

async function loadDashboardData() {
  try {
    const [summaryResult, skillsResult, employersResult, trainingResult, trendResult] = await Promise.all([
      apiRequest("/api/market/summary"),
      apiRequest("/api/market/skills"),
      apiRequest("/api/market/employers"),
      apiRequest("/api/market/training"),
      apiRequest(`/api/market/trends?months=${periodSelect.value}`),
    ]);
    const summary = summaryResult.summary;
    hasImportedMarketData = !summaryResult.illustrative;
    if (!summaryResult.illustrative) {
      document.querySelector("#metric-vacancies").textContent = Number(summary.vacancies).toLocaleString();
      document.querySelector("#metric-vacancy-change").textContent = `${Number(summary.annual_change) >= 0 ? "↗ " : "↘ "}${Math.abs(Number(summary.annual_change))}%`;
      document.querySelector("#metric-vacancy-caption").textContent = `Across ${summary.sectors} sectors · ${summary.sources} data sources`;
      document.querySelector("#metric-momentum").textContent = `${Number(summary.annual_change) > 0 ? "+" : ""}${summary.annual_change}%`;
      document.querySelector("#metric-momentum-caption").textContent = "Year-on-year change · imported postings";
      document.querySelector("#metric-skills").textContent = Number(skillsResult.skills[0]?.skill_count ?? 0).toLocaleString();
      document.querySelector("#metric-salary").textContent = summary.median_salary === null ? "—" : `P ${Number(summary.median_salary).toLocaleString()}`;
      document.querySelector("#metric-salary-caption").textContent = "Median · imported monthly salaries";
      document.querySelector("#data-disclaimer").textContent = "Imported labour-market data. Coverage depends on sources supplied by administrators.";
      document.querySelector(".updated-label").textContent = "IMPORTED LABOUR-MARKET DATA";
      liveTrendRows = trendResult.months;
      updateChart();
      renderMarketLists(skillsResult.skills, employersResult.employers, trainingResult.providers);
    } else {
      document.querySelector(".updated-label").textContent = "SAMPLE DATA · IMPORT A CSV TO UPDATE";
      if (trainingResult.providers.length) {
        renderDirectory("#training-list", trainingResult.providers.slice(0, 8).map((provider) => ({
          title: provider.name,
          description: `${provider.location} · ${provider.offerings.join(" · ")}`,
        })));
        document.querySelector("#data-disclaimer").textContent = "Market figures are illustrative; the training directory reflects imported provider data.";
      }
    }
  } catch (error) {
    document.querySelector(".updated-label").textContent = "SAMPLE DATA · APPLICATION SERVER REQUIRED";
    document.querySelector("#data-disclaimer").textContent = "Illustrative sample data. Run the Thuso Node.js server and PostgreSQL database to use accounts, imports, and live analytics.";
    console.error("Labour-market dashboard could not connect to the API.", error);
  }
}

function renderMarketLists(skills, employers, providers) {
  const table = document.querySelector("#skills-table");
  const header = table.querySelector(".table-head");
  table.replaceChildren(header);
  for (const skill of skills.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "skill-row";
    const name = document.createElement("div");
    name.className = "skill-name";
    const dot = document.createElement("span");
    dot.className = "skill-dot dot-digital";
    const label = document.createElement("strong");
    label.textContent = skill.skill;
    name.append(dot, label);
    const demand = document.createElement("div");
    demand.className = "demand-cell";
    const track = document.createElement("div");
    track.className = "demand-track";
    const fill = document.createElement("span");
    fill.style.width = `${Math.min(100, Number(skill.demand_percent))}%`;
    track.append(fill);
    const percentage = document.createElement("strong");
    percentage.textContent = `${skill.demand_percent}%`;
    demand.append(track, percentage);
    const change = document.createElement("span");
    change.className = `change-tag ${skill.change_percent >= 0 ? "up" : "down"}`;
    change.textContent = skill.trend === "emerging"
      ? "New"
      : `${skill.change_percent >= 0 ? "↗" : "↘"} ${Math.abs(Number(skill.change_percent))}%`;
    row.append(name, demand, change);
    table.append(row);
  }
  renderDirectory("#employer-list", employers.slice(0, 8).map((employer) => ({
    title: employer.name,
    description: `${employer.sector} · ${employer.vacancies} tracked postings`,
  })));
  renderDirectory("#training-list", providers.slice(0, 8).map((provider) => ({
    title: provider.name,
    description: `${provider.location} · ${provider.offerings.join(" · ")}`,
  })));
}

function renderDirectory(selector, entries) {
  const list = document.querySelector(selector);
  list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const description = document.createElement("span");
    description.textContent = entry.description;
    item.append(title, description);
    list.append(item);
  }
}

async function loadRecommendations() {
  if (!currentUser) return;
  const result = await apiRequest("/api/recommendations");
  if (!result.recommendations.length) return;
  liveRoles.clear();
  const options = result.recommendations.map((recommendation) => {
    const id = recommendation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const role = {
      title: recommendation.title,
      summary: `${recommendation.vacancies} tracked postings in ${recommendation.sector}.`,
      outlook: recommendation.vacancies >= 20 ? "Strong demand" : "Market demand",
      match: Number(recommendation.suitability),
      skills: recommendation.skills,
      missingSkills: recommendation.missing_skills,
    };
    liveRoles.set(id, role);
    return { id, title: recommendation.title };
  });
  const selectedId = roleSelect.value;
  roleSelect.replaceChildren(...options.map(({ id, title }) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = title;
    return option;
  }));
  roleSelect.value = liveRoles.has(selectedId) ? selectedId : options[0].id;
  updateRole();
  updateSaveButtons();
}

document.querySelector("#pathway-button").addEventListener("click", async () => {
  const role = getSelectedRole();
  let missingSkills = role.missingSkills ?? [];
  let training = [];
  if (currentUser && liveRoles.has(roleSelect.value)) {
    try {
      const result = await apiRequest(`/api/skills-gap?role=${encodeURIComponent(role.title)}`);
      missingSkills = result.report?.missingSkills ?? missingSkills;
      training = result.training;
    } catch (error) {
      showApiError(error);
    }
  }
  openDialog(`${role.title} pathway`, (container) => {
    addDialogParagraph(container, role.summary);
    const skills = document.createElement("ul");
    role.skills.forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      skills.append(item);
    });
    container.append(skills);
    if (missingSkills.length) {
      addDialogParagraph(container, `Skills to build: ${missingSkills.join(" · ")}`);
    }
    if (training.length) {
      addDialogParagraph(container, `Matching training providers: ${training.map((provider) => `${provider.name} · ${provider.location}`).join("; ")}`);
    }
    addDialogParagraph(container, "Suggested next steps: compare training options, practise the listed skills, and review relevant employer opportunities.");
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    addDialogButton(actions, "View training options", () => {
      actionDialog.close();
      navigateTo("learning");
    });
    addDialogButton(actions, "Save pathway", () => saveInsight(
      `pathway-${roleSelect.value}`,
      `${role.title} pathway`,
      role.skills.join(" · "),
    ).catch(showApiError), true);
    container.append(actions);
  });
});

document.querySelector("#save-skills-button").addEventListener("click", () => {
  saveInsight("skills", "In-demand skills", "Demand-ranked skills extracted from imported job postings.").catch(showApiError);
});

document.querySelector("#save-pathway-button").addEventListener("click", () => {
  const role = getSelectedRole();
  saveInsight(`pathway-${roleSelect.value}`, `${role.title} pathway`, role.skills.join(" · ")).catch(showApiError);
});

const authToggle = document.querySelector("#auth-toggle");
async function signOut() {
  if (!currentUser) return;
  await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
  currentUser = null;
  csrfToken = null;
  await refreshSavedInsights();
  liveRoles.clear();
  roleSelect.replaceChildren(
    ...Object.entries(roles).map(([id, role]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = role.title;
      return option;
    }),
  );
  updateRole();
  updateAccountChrome();
  actionDialog.close();
  showToast("You have signed out.");
}

authToggle.addEventListener("click", () => {
  if (!currentUser) {
    openAuthDialog();
    return;
  }
  openProfileDialog();
});

document.querySelector(".notification-button").addEventListener("click", () => {
  openDialog("Notifications", (container) => {
    addDialogParagraph(container, "You’re all caught up. Browse the latest market trends or explore available training options.");
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    addDialogButton(actions, "Market trends", () => {
      actionDialog.close();
      navigateTo("trends");
    });
    addDialogButton(actions, "Skills & education", () => {
      actionDialog.close();
      navigateTo("learning");
    }, true);
    container.append(actions);
  });
});

document.querySelector(".profile-menu").addEventListener("click", () => {
  openProfileDialog();
});

document.querySelector(".dialog-close").addEventListener("click", () => actionDialog.close());
actionDialog.addEventListener("click", (event) => {
  if (event.target === actionDialog) actionDialog.close();
});

roleSelect.addEventListener("change", updateSaveButtons);
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("overview");
});

document.querySelector("#market-import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  if (!form.reportValidity()) return;
  button.disabled = true;
  const formData = new FormData(form);
  try {
    const result = await apiRequest("/api/admin/imports", { method: "POST", body: formData });
    form.reset();
    showToast(`Imported ${result.imported} records (${result.inserted} new, ${result.updated} updated).`);
    await Promise.all([loadImportHistory(), loadAdminOverview(), loadDashboardData()]);
  } catch (error) {
    showApiError(error);
  } finally {
    button.disabled = false;
  }
});

document.querySelector(".admin-nav-link").addEventListener("click", () => {
  if (currentUser?.role === "admin") {
    Promise.all([loadImportHistory(), loadAdminOverview()]).catch(showApiError);
  }
});

updateSavedInsights();
updateSaveButtons();
updateAccountChrome();
apiRequest("/api/auth/me")
  .then(async (result) => {
    currentUser = result.user;
    updateAccountChrome();
    await refreshSavedInsights();
    await loadRecommendations();
    if (currentUser?.role === "admin") {
      Promise.all([loadImportHistory(), loadAdminOverview()]).catch(showApiError);
    }
  })
  .catch((error) => {
    console.error("Thuso could not check the current account.", error);
    document.querySelector(".updated-label").textContent = "SAMPLE DATA · APPLICATION SERVER REQUIRED";
  });

function escapeSvgText(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

async function downloadSnapshotImage() {
  const role = getSelectedRole();
  const metric = (selector) => document.querySelector(selector).textContent.trim();
  const importedData = document.querySelector("#data-disclaimer").textContent.startsWith("Imported");
  const chartLines = [...chart.querySelectorAll(".chart-line")].filter((line) => line.getAttribute("d"));
  const lineMarkup = chartLines.map((line) => (
    `<path d="${line.getAttribute("d")}" fill="none" stroke="${getComputedStyle(line).stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
  )).join("");
  const legend = [...document.querySelectorAll(".chart-legend span")].map((item, index) => {
    const color = item.querySelector(".legend-dot")?.style.getPropertyValue("--dot") || ["#5269df", "#34b89a", "#efb554"][index];
    return { label: item.textContent.trim(), color };
  });
  const legendMarkup = legend.map((item, index) => `
    <circle cx="${100 + index * 170}" cy="735" r="5" fill="${escapeSvgText(item.color)}"/>
    <text x="${112 + index * 170}" y="740" fill="#818a9d" font-family="Arial, sans-serif" font-size="13">${escapeSvgText(item.label)}</text>
  `).join("");
  const chartDateLabels = [...chartLabels.children].map((label) => label.textContent.trim());
  const dateLabelInterval = Math.max(1, Math.ceil(chartDateLabels.length / 6));
  const dateLabelsMarkup = chartDateLabels
    .filter((_label, index) => index % dateLabelInterval === 0 || index === chartDateLabels.length - 1)
    .map((label, index, visibleLabels) => `
      <text x="${90 + index * 460 / Math.max(1, visibleLabels.length - 1)}" y="687" text-anchor="${index === 0 ? "start" : index === visibleLabels.length - 1 ? "end" : "middle"}">${escapeSvgText(label)}</text>
    `).join("");
  const yAxisLabels = [...document.querySelectorAll(".y-labels span")].map((label) => label.textContent.trim());
  const yAxisMarkup = yAxisLabels.map((label, index) => `
    <path d="M90 ${420 + index * 60}H550"/>
    <text x="77" y="${424 + index * 60}" text-anchor="end" fill="#aab1bd" font-family="Arial, sans-serif" font-size="11">${escapeSvgText(label)}</text>
  `).join("");
  const skillsMarkup = role.skills.slice(0, 5).map((skill, index) => `
    <rect x="644" y="${486 + index * 43}" width="460" height="32" rx="7" fill="#f5f7fb"/>
    <text x="660" y="${507 + index * 43}" fill="#526078" font-family="Arial, sans-serif" font-size="15">${escapeSvgText(skill)}</text>
  `).join("");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <rect width="1200" height="800" fill="#f5f7fb"/>
      <text x="48" y="57" fill="#5369dc" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2">THUSO · BOTSWANA SKILLS INTELLIGENCE</text>
      <text x="48" y="105" fill="#20283b" font-family="Arial, sans-serif" font-size="34" font-weight="700">Botswana labor market snapshot</text>
      <text x="48" y="133" fill="#8992a5" font-family="Arial, sans-serif" font-size="16">A quick view of market signals and your selected career path</text>

      <g font-family="Arial, sans-serif">
        <rect x="48" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="68" y="197" fill="#8992a5" font-size="13" font-weight="700">VACANCIES TRACKED</text>
        <text x="68" y="239" fill="#263047" font-size="32" font-weight="700">${escapeSvgText(metric("#metric-vacancies"))}</text>
        <text x="68" y="261" fill="#8992a5" font-size="13">${escapeSvgText(metric("#metric-vacancy-caption"))}</text>

        <rect x="327" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="347" y="197" fill="#8992a5" font-size="13" font-weight="700">HIRING MOMENTUM</text>
        <text x="347" y="239" fill="#263047" font-size="32" font-weight="700">${escapeSvgText(metric("#metric-momentum"))}</text>
        <text x="347" y="261" fill="#8992a5" font-size="13">${escapeSvgText(metric("#metric-momentum-caption"))}</text>

        <rect x="606" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="626" y="197" fill="#8992a5" font-size="13" font-weight="700">IN-DEMAND SKILLS</text>
        <text x="626" y="239" fill="#263047" font-size="32" font-weight="700">${escapeSvgText(metric("#metric-skills"))}</text>
        <text x="626" y="261" fill="#8992a5" font-size="13">Skills identified</text>

        <rect x="885" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="905" y="197" fill="#8992a5" font-size="13" font-weight="700">${importedData ? "MEDIAN SALARY" : "MEDIAN SAMPLE SALARY"}</text>
        <text x="905" y="239" fill="#263047" font-size="32" font-weight="700">${escapeSvgText(metric("#metric-salary"))}</text>
        <text x="905" y="261" fill="#8992a5" font-size="13">Per month</text>
      </g>

      <rect x="48" y="300" width="540" height="414" rx="12" fill="#fff" stroke="#edf0f5"/>
      <text x="76" y="341" fill="#293248" font-family="Arial, sans-serif" font-size="21" font-weight="700">Vacancy activity</text>
      <text x="76" y="366" fill="#8992a5" font-family="Arial, sans-serif" font-size="14">${importedData ? `Imported data · ${escapeSvgText(periodSelect.selectedOptions[0].textContent)}` : "Illustrative vacancy activity by sector"}</text>
      <g fill="none" stroke="#edf0f5" font-family="Arial, sans-serif">${yAxisMarkup}</g>
      <g transform="translate(90 395) scale(.6389 1.25)">${lineMarkup}</g>
      <g fill="#818a9d" font-family="Arial, sans-serif" font-size="12">${dateLabelsMarkup}</g>
      ${legendMarkup}

      <rect x="612" y="300" width="540" height="414" rx="12" fill="#fff" stroke="#edf0f5"/>
      <text x="644" y="341" fill="#8992a5" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">YOUR NEXT MOVE</text>
      <text x="644" y="380" fill="#293248" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeSvgText(role.title)}</text>
      <rect x="644" y="399" width="190" height="31" rx="15" fill="#eaf8f3"/>
      <text x="660" y="420" fill="#269976" font-family="Arial, sans-serif" font-size="14" font-weight="700">${escapeSvgText(role.outlook)}</text>
      <text x="644" y="468" fill="#8992a5" font-family="Arial, sans-serif" font-size="13" font-weight="700">RECOMMENDED SKILLS</text>
      ${skillsMarkup}
      <text x="644" y="682" fill="#69738a" font-family="Arial, sans-serif" font-size="14">Career suitability</text>
      <text x="1098" y="682" fill="#293248" font-family="Arial, sans-serif" font-size="16" font-weight="700" text-anchor="end">${role.match}%</text>
      <rect x="644" y="694" width="460" height="8" rx="4" fill="#edf0f5"/>
      <rect x="644" y="694" width="${Math.round(460 * role.match / 100)}" height="8" rx="4" fill="#5269df"/>

      <text x="48" y="780" fill="#8992a5" font-family="Arial, sans-serif" font-size="13">${escapeSvgText(document.querySelector("#data-disclaimer").textContent)}</text>
    </svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The snapshot image could not be rendered."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is not supported by this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The PNG image could not be created."));
      }, "image/png");
    });

    const pngUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "thuso-botswana-market-snapshot.png";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 60_000);
    showToast("Your snapshot image has been downloaded.");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

document.querySelector("#download-report").addEventListener("click", () => {
  downloadSnapshotImage().catch((error) => {
    console.error("Snapshot image export failed.", error);
    showToast("The snapshot image could not be exported. Please try again.");
  });
});

const periodSelect = document.querySelector("#period-select");
const chart = document.querySelector("#trend-chart");
const chartLabels = document.querySelector("#chart-labels");
const monthLabels = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const chartSeries = {
  6: {
    labels: ["May", "Jun", "Jul", "Aug", "Sep", "Oct"],
    paths: [
      "M0 149 L144 137 L288 116 L432 96 L576 77 L720 39",
      "M0 169 L144 160 L288 153 L432 139 L576 126 L720 104",
      "M0 182 L144 177 L288 173 L432 163 L576 151 L720 139",
    ],
  },
  12: {
    labels: monthLabels,
    paths: [
      "M0 154 L65 147 L130 151 L196 129 L261 137 L327 112 L392 121 L458 91 L523 103 L589 70 L654 78 L720 39",
      "M0 176 L65 169 L130 172 L196 163 L261 166 L327 150 L392 157 L458 143 L523 147 L589 123 L654 128 L720 104",
      "M0 188 L65 180 L130 185 L196 177 L261 173 L327 178 L392 165 L458 171 L523 155 L589 161 L654 147 L720 139",
    ],
  },
  24: {
    labels: ["Nov", "Jan", "Mar", "May", "Jul", "Sep", "Oct", "Dec", "Feb", "Apr", "Jun", "Aug"],
    paths: [
      "M0 176 L65 180 L130 166 L196 170 L261 148 L327 154 L392 130 L458 136 L523 108 L589 113 L654 78 L720 39",
      "M0 192 L65 188 L130 181 L196 178 L261 166 L327 169 L392 157 L458 150 L523 141 L589 136 L654 119 L720 104",
      "M0 198 L65 192 L130 190 L196 185 L261 181 L327 177 L392 174 L458 164 L523 164 L589 156 L654 149 L720 139",
    ],
  },
  36: {
    labels: ["2023", "2024", "2025", "2026"],
    paths: [
      "M0 164 L240 133 L480 91 L720 39",
      "M0 181 L240 163 L480 135 L720 104",
      "M0 192 L240 178 L480 158 L720 139",
    ],
  },
  60: {
    labels: ["2021", "2022", "2023", "2024", "2025", "2026"],
    paths: [
      "M0 183 L144 169 L288 151 L432 124 L576 83 L720 39",
      "M0 193 L144 185 L288 171 L432 154 L576 129 L720 104",
      "M0 199 L144 193 L288 185 L432 174 L576 157 L720 139",
    ],
  },
};

function updateChart() {
  if (liveTrendRows.length) {
    renderLiveTrend();
    return;
  }
  if (hasImportedMarketData) {
    renderEmptyTrend();
    return;
  }
  const series = chartSeries[periodSelect.value];
  const lines = chart.querySelectorAll(".chart-line");
  lines.forEach((line, index) => line.setAttribute("d", series.paths[index]));
  const area = chart.querySelector(".chart-area");
  const areaPath = series.paths[0].replace(/^M0 \d+/, (start) => start).replace(/$/, " L720 202 L0 202 Z");
  area.setAttribute("d", areaPath);
  chartLabels.replaceChildren(
    ...series.labels.map((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      return item;
    }),
  );
  const selectedPeriod = periodSelect.selectedOptions[0].textContent.toLowerCase();
  chart.setAttribute("aria-label", `Illustrative vacancy activity over the ${selectedPeriod} across business, technology, and health sectors`);
}

function renderLiveTrend() {
  const totals = new Map();
  const rowsByMonth = new Map();
  liveTrendRows.forEach((row) => {
    const month = String(row.month).slice(0, 7);
    totals.set(row.sector, (totals.get(row.sector) ?? 0) + Number(row.vacancies));
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, new Map());
    rowsByMonth.get(month).set(row.sector, Number(row.vacancies));
  });
  const sectors = [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3);
  const labels = [...rowsByMonth.keys()].sort();
  const colors = ["#5269df", "#34b89a", "#efb554"];
  const maximum = Math.max(1, ...liveTrendRows.map((row) => Number(row.vacancies)));
  const lines = chart.querySelectorAll(".chart-line");

  sectors.forEach(([sector], sectorIndex) => {
    const points = labels.map((month, index) => {
      const x = labels.length <= 1 ? 360 : (index * 720) / (labels.length - 1);
      const vacancies = rowsByMonth.get(month).get(sector) ?? 0;
      const y = 202 - (vacancies / maximum) * 188;
      return { x, y };
    });
    const coordinates = points.map(({ x, y }, index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    lines[sectorIndex].setAttribute("d", coordinates);
    lines[sectorIndex].style.stroke = colors[sectorIndex];
  });
  for (let index = sectors.length; index < lines.length; index += 1) {
    lines[index].setAttribute("d", "");
  }

  const area = chart.querySelector(".chart-area");
  if (sectors.length) {
    const firstPoints = lines[0].getAttribute("d").match(/[\d.]+/g);
    if (firstPoints?.length >= 2) {
      const firstX = firstPoints[0];
      const lastX = firstPoints[firstPoints.length - 2];
      area.setAttribute("d", `${lines[0].getAttribute("d")} L${lastX} 202 L${firstX} 202 Z`);
    }
  }

  document.querySelector(".chart-legend").replaceChildren(...sectors.map(([sector], index) => {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = "legend-dot";
    dot.style.setProperty("--dot", colors[index]);
    item.append(dot, document.createTextNode(` ${sector}`));
    return item;
  }));
  chartLabels.replaceChildren(...labels.map((month) => {
    const item = document.createElement("span");
    item.textContent = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      year: labels.length > 12 ? "2-digit" : undefined,
      timeZone: "UTC",
    });
    return item;
  }));
  document.querySelector(".y-labels").replaceChildren(...[1, 0.75, 0.5, 0.25, 0].map((proportion) => {
    const label = document.createElement("span");
    label.textContent = Math.round(maximum * proportion).toLocaleString();
    return label;
  }));
  const selectedPeriod = periodSelect.selectedOptions[0].textContent.toLowerCase();
  chart.setAttribute("aria-label", `Imported vacancy activity over the ${selectedPeriod} across ${sectors.map(([sector]) => sector).join(", ") || "no matching sectors"}`);
}

function renderEmptyTrend() {
  chart.querySelector(".chart-area").setAttribute("d", "");
  chart.querySelectorAll(".chart-line").forEach((line) => line.setAttribute("d", ""));
  document.querySelector(".chart-legend").replaceChildren(
    document.createTextNode("No imported postings in this period."),
  );
  chartLabels.replaceChildren();
  document.querySelector(".y-labels").replaceChildren();
  const selectedPeriod = periodSelect.selectedOptions[0].textContent.toLowerCase();
  chart.setAttribute("aria-label", `No imported vacancy activity for the ${selectedPeriod}`);
}

periodSelect.addEventListener("change", async () => {
  liveTrendRows = [];
  updateChart();
  try {
    const result = await apiRequest(`/api/market/trends?months=${periodSelect.value}`);
    liveTrendRows = result.months;
    updateChart();
  } catch (error) {
    showApiError(error);
  }
});
updateChart();
loadDashboardData();
