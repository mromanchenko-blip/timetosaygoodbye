// Мінімальна "збірка" для Vercel: копіює файли в dist/ і підставляє
// повну адресу сайту в шерінг-картинку (og:image потребує абсолютного URL).
const fs = require("fs");
const path = require("path");

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
const siteUrl = process.env.SITE_URL || (host ? `https://${host}` : "");

const out = path.join(__dirname, "dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = ["index.html", "styles.css", "script.js", "event.ics", "og.png", "assets"];
for (const f of files) {
  fs.cpSync(path.join(__dirname, f), path.join(out, f), { recursive: true });
}

const htmlPath = path.join(out, "index.html");
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, "utf8").replaceAll("%SITE_URL%", siteUrl));
console.log(`Built to dist/ with SITE_URL="${siteUrl}"`);
