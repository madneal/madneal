const fs = require("fs/promises");
const path = require("path");

const USERNAME = process.env.GITHUB_USERNAME || "madneal";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const ROOT = path.resolve(__dirname, "..");
const README = path.join(ROOT, "README.md");
const START = "<!-- ACTIVITY:START -->";
const END = "<!-- ACTIVITY:END -->";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USERNAME}-profile-readme-generator`,
};

if (TOKEN) {
  headers.Authorization = `Bearer ${TOKEN}`;
}

async function github(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${pathname}: ${body}`);
  }
  return response.json();
}

async function paged(pathname) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const chunk = await github(`${pathname}${pathname.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    results.push(...chunk);
    if (chunk.length < 100) break;
  }
  return results;
}

function compactDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function repoLink(repo) {
  return `[${repo.name}](${repo.html_url})`;
}

function renderActivity({ user, repos }) {
  const originalRepos = repos.filter((repo) => !repo.fork);
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const activeSince = Date.now() - 1000 * 60 * 60 * 24 * 180;
  const activeRepos = repos.filter((repo) => new Date(repo.pushed_at).getTime() >= activeSince);

  const featured = originalRepos
    .filter((repo) => !repo.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 6);

  const recent = originalRepos
    .filter((repo) => !repo.archived)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 5);

  const lines = [];
  lines.push(`_Updated by my own script: ${compactDate(new Date().toISOString())}._`);
  lines.push("");
  lines.push(`**${user.public_repos}** public repos · **${originalRepos.length}** original · **${activeRepos.length}** active recently · **${totalStars}** stars · **${totalForks}** forks`);
  lines.push("");
  lines.push("**Featured**");
  for (const repo of featured) {
    lines.push(`- ${repoLink(repo)} · ${repo.stargazers_count} stars · ${escapeCell(repo.language || "Mixed")}`);
  }
  lines.push("");
  lines.push("**Recently Updated**");
  for (const repo of recent) {
    lines.push(`- ${repoLink(repo)} · ${compactDate(repo.pushed_at)}`);
  }

  return lines.join("\n");
}

async function main() {
  const [user, repos, readme] = await Promise.all([
    github(`/users/${USERNAME}`),
    paged(`/users/${USERNAME}/repos?sort=pushed&type=owner`),
    fs.readFile(README, "utf8"),
  ]);

  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README must contain ${START} and ${END} markers.`);
  }

  const generated = renderActivity({ user, repos });
  const next = `${readme.slice(0, start + START.length)}\n${generated}\n${readme.slice(end)}`;
  await fs.writeFile(README, next);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
