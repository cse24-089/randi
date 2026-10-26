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
const savedInsightsStorageKey = "thuso-saved-insights";
let canPersistSavedInsights = true;

try {
  const storedInsights = JSON.parse(localStorage.getItem(savedInsightsStorageKey) ?? "[]");
  if (Array.isArray(storedInsights)) {
    storedInsights.forEach((entry) => {
      if (
        Array.isArray(entry)
        && typeof entry[0] === "string"
        && entry[1]
        && typeof entry[1].title === "string"
        && typeof entry[1].description === "string"
      ) {
        savedInsights.set(entry[0], { title: entry[1].title, description: entry[1].description });
      }
    });
  }
} catch (error) {
  console.error("Saved insights could not be loaded from this browser.", error);
}

function persistSavedInsights() {
  try {
    localStorage.setItem(savedInsightsStorageKey, JSON.stringify([...savedInsights]));
    canPersistSavedInsights = true;
    return true;
  } catch (error) {
    canPersistSavedInsights = false;
    console.error("Saved insights could not be stored in this browser.", error);
    return false;
  }
}

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
      saveInsight(id, insight.title, insight.description);
    });
    item.append(details, removeButton);
    savedList.append(item);
  });
}

function saveInsight(id, title, description) {
  let message;
  if (savedInsights.has(id)) {
    savedInsights.delete(id);
    message = `${title} removed from saved insights.`;
  } else {
    savedInsights.set(id, { title, description });
    message = `${title} added to saved insights.`;
  }
  persistSavedInsights();
  updateSavedInsights();
  updateSaveButtons();
  showToast(canPersistSavedInsights ? message : `${message} It will only be saved for this session.`);
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
  authToggle.textContent = isLoggedIn ? "End demo" : "Try demo";
  document.querySelector(".profile-copy strong").textContent = isLoggedIn ? "Demo user" : "Guest";
  document.querySelector(".profile-copy span").textContent = isLoggedIn ? "Career explorer" : "Browsing as guest";
  document.querySelector(".avatar").textContent = isLoggedIn ? "D" : "G";
  showToast(isLoggedIn
    ? "Demo profile activated. This prototype does not provide secure account login."
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
    addDialogParagraph(container, `${isLoggedIn ? "Demo user" : "Guest"} · ${isLoggedIn ? "Career explorer" : "Browsing as guest"}`);
    addDialogButton(container, isLoggedIn ? "End demo" : "Try demo", () => {
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
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <rect width="1200" height="800" fill="#f5f7fb"/>
      <text x="48" y="57" fill="#5369dc" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2">THUSO · BOTSWANA SKILLS INTELLIGENCE</text>
      <text x="48" y="105" fill="#20283b" font-family="Arial, sans-serif" font-size="34" font-weight="700">Botswana labor market snapshot</text>
      <text x="48" y="133" fill="#8992a5" font-family="Arial, sans-serif" font-size="16">A quick view of market signals and your selected career path</text>

      <g font-family="Arial, sans-serif">
        <rect x="48" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="68" y="197" fill="#8992a5" font-size="13" font-weight="700">VACANCIES TRACKED</text>
        <text x="68" y="239" fill="#263047" font-size="32" font-weight="700">1,284</text>
        <text x="68" y="261" fill="#8992a5" font-size="13">Across 8 sectors · sample</text>

        <rect x="327" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="347" y="197" fill="#8992a5" font-size="13" font-weight="700">HIRING MOMENTUM</text>
        <text x="347" y="239" fill="#263047" font-size="32" font-weight="700">+18.4%</text>
        <text x="347" y="261" fill="#8992a5" font-size="13">Year-on-year change</text>

        <rect x="606" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="626" y="197" fill="#8992a5" font-size="13" font-weight="700">IN-DEMAND SKILLS</text>
        <text x="626" y="239" fill="#263047" font-size="32" font-weight="700">46</text>
        <text x="626" y="261" fill="#8992a5" font-size="13">Skills identified</text>

        <rect x="885" y="165" width="267" height="112" rx="12" fill="#fff" stroke="#edf0f5"/>
        <text x="905" y="197" fill="#8992a5" font-size="13" font-weight="700">MEDIAN SAMPLE SALARY</text>
        <text x="905" y="239" fill="#263047" font-size="32" font-weight="700">P 8,450</text>
        <text x="905" y="261" fill="#8992a5" font-size="13">Per month</text>
      </g>

      <rect x="48" y="300" width="540" height="414" rx="12" fill="#fff" stroke="#edf0f5"/>
      <text x="76" y="341" fill="#293248" font-family="Arial, sans-serif" font-size="21" font-weight="700">Hiring is picking up</text>
      <text x="76" y="366" fill="#8992a5" font-family="Arial, sans-serif" font-size="14">Illustrative vacancy activity by sector</text>
      <g stroke="#edf0f5">
        <path d="M90 420H550M90 480H550M90 540H550M90 600H550M90 660H550"/>
      </g>
      <path d="M90 600 L132 585 L174 590 L216 560 L258 570 L300 535 L342 545 L384 510 L426 520 L468 475 L510 485 L550 440" fill="none" stroke="#5269df" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M90 630 L132 620 L174 625 L216 610 L258 615 L300 590 L342 600 L384 580 L426 585 L468 555 L510 560 L550 530" fill="none" stroke="#34b89a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M90 650 L132 642 L174 646 L216 638 L258 632 L300 640 L342 625 L384 630 L426 610 L468 615 L510 595 L550 585" fill="none" stroke="#efb554" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <g fill="#818a9d" font-family="Arial, sans-serif" font-size="12">
        <text x="90" y="687">NOV</text><text x="175" y="687">JAN</text><text x="260" y="687">MAR</text>
        <text x="345" y="687">MAY</text><text x="430" y="687">JUL</text><text x="520" y="687">OCT</text>
      </g>
      <circle cx="100" cy="735" r="5" fill="#5269df"/><text x="112" y="740" fill="#818a9d" font-family="Arial, sans-serif" font-size="13">Business &amp; finance</text>
      <circle cx="275" cy="735" r="5" fill="#34b89a"/><text x="287" y="740" fill="#818a9d" font-family="Arial, sans-serif" font-size="13">Technology</text>
      <circle cx="405" cy="735" r="5" fill="#efb554"/><text x="417" y="740" fill="#818a9d" font-family="Arial, sans-serif" font-size="13">Health &amp; care</text>

      <rect x="612" y="300" width="540" height="414" rx="12" fill="#fff" stroke="#edf0f5"/>
      <text x="644" y="341" fill="#8992a5" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">YOUR NEXT MOVE</text>
      <text x="644" y="380" fill="#293248" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeSvgText(role.title)}</text>
      <rect x="644" y="399" width="190" height="31" rx="15" fill="#eaf8f3"/>
      <text x="660" y="420" fill="#269976" font-family="Arial, sans-serif" font-size="14" font-weight="700">${escapeSvgText(role.outlook)}</text>
      <text x="644" y="468" fill="#8992a5" font-family="Arial, sans-serif" font-size="13" font-weight="700">RECOMMENDED SKILLS</text>
      ${role.skills.map((skill, index) => `
        <rect x="644" y="${486 + index * 43}" width="460" height="32" rx="7" fill="#f5f7fb"/>
        <text x="660" y="${507 + index * 43}" fill="#526078" font-family="Arial, sans-serif" font-size="15">${escapeSvgText(skill)}</text>
      `).join("")}
      <text x="644" y="682" fill="#69738a" font-family="Arial, sans-serif" font-size="14">Skills match opportunity</text>
      <text x="1098" y="682" fill="#293248" font-family="Arial, sans-serif" font-size="16" font-weight="700" text-anchor="end">${role.match}%</text>
      <rect x="644" y="694" width="460" height="8" rx="4" fill="#edf0f5"/>
      <rect x="644" y="694" width="${Math.round(460 * role.match / 100)}" height="8" rx="4" fill="#5269df"/>

      <text x="48" y="780" fill="#8992a5" font-family="Arial, sans-serif" font-size="13">Prototype sample data — illustrative only, not official labor-market statistics.</text>
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
