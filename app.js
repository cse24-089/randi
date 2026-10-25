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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function updateRole() {
  const role = roles[roleSelect.value];
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

function navigateTo(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  const link = document.querySelector(`.nav-link[href="#${sectionId}"]`);
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === link));
  document.querySelector("#page-heading").textContent = link?.dataset.view ?? target.querySelector("h2")?.textContent ?? "Overview";
  history.pushState(null, "", `#${sectionId}`);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.addEventListener("popstate", () => {
  const sectionId = window.location.hash.slice(1) || "overview";
  const target = document.getElementById(sectionId);
  if (!target) return;
  const link = document.querySelector(`.nav-link[href="#${sectionId}"]`);
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === link));
  document.querySelector("#page-heading").textContent = link?.dataset.view ?? target.querySelector("h2")?.textContent ?? "Overview";
});

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
  return roles[roleSelect.value];
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
      savedInsights.delete(id);
      updateSavedInsights();
    });
    item.append(details, removeButton);
    savedList.append(item);
  });
}

function saveInsight(id, title, description) {
  if (savedInsights.has(id)) {
    savedInsights.delete(id);
    showToast(`${title} removed from saved insights.`);
  } else {
    savedInsights.set(id, { title, description });
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

function openDialog(title, contentBuilder) {
  dialogTitle.textContent = title;
  dialogContent.replaceChildren();
  contentBuilder(dialogContent);
  actionDialog.showModal();
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

function toggleAuthentication() {
  isLoggedIn = !isLoggedIn;
  authToggle.textContent = isLoggedIn ? "Log out" : "Log in";
  document.querySelector(".profile-copy strong").textContent = isLoggedIn ? "K. Gosego" : "Guest";
  document.querySelector(".profile-copy span").textContent = isLoggedIn ? "Career explorer" : "Browsing as guest";
  document.querySelector(".avatar").textContent = isLoggedIn ? "KG" : "G";
  showToast(isLoggedIn
    ? "Demo session started. This prototype does not provide secure account login."
    : "Demo session ended. Your prototype profile is now signed out.");
}

document.querySelector("#pathway-button").addEventListener("click", () => {
  const role = getSelectedRole();
  openDialog(`${role.title} pathway`, (container) => {
    addDialogParagraph(container, role.summary);
    const skills = document.createElement("ul");
    role.skills.forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      skills.append(item);
    });
    container.append(skills);
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
    ), true);
    container.append(actions);
  });
});

document.querySelector("#save-skills-button").addEventListener("click", () => {
  saveInsight("skills", "In-demand skills", "Data analysis · Financial reporting · Cloud computing · Project management · Customer service");
});

document.querySelector("#save-pathway-button").addEventListener("click", () => {
  const role = getSelectedRole();
  saveInsight(`pathway-${roleSelect.value}`, `${role.title} pathway`, role.skills.join(" · "));
});

const authToggle = document.querySelector("#auth-toggle");
let isLoggedIn = true;

authToggle.addEventListener("click", toggleAuthentication);

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
  openDialog("Profile options", (container) => {
    addDialogParagraph(container, `${isLoggedIn ? "K. Gosego" : "Guest"} · ${isLoggedIn ? "Career explorer" : "Browsing as guest"}`);
    addDialogButton(container, isLoggedIn ? "Log out" : "Log in", () => {
      toggleAuthentication();
      actionDialog.close();
    }, true);
  });
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

updateSavedInsights();
updateSaveButtons();

document.querySelector("#download-report").addEventListener("click", () => {
  const report = [
    "Thuso | Botswana labor market snapshot",
    "Prototype sample data — illustrative only, not official labor statistics.",
    "",
    "Vacancies tracked: 1,284",
    "Hiring momentum: +18.4%",
    "Median sample salary: P 8,450 / month",
    "",
    `Selected career path: ${roles[roleSelect.value].title}`,
    `Role outlook: ${roles[roleSelect.value].outlook}`,
    `Skills match opportunity: ${roles[roleSelect.value].match}%`,
    `Recommended skills: ${roles[roleSelect.value].skills.join(", ")}`,
  ].join("\n");
  const file = new Blob([report], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "thuso-botswana-market-snapshot.txt";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Your snapshot has been exported.");
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

periodSelect.addEventListener("change", updateChart);
updateChart();
