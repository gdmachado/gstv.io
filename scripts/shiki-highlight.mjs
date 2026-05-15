import { promises as fs } from "node:fs";
import path from "node:path";
import { codeToTokens } from "shiki";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const THEMES = {
  light: process.env.SHIKI_LIGHT_THEME || "github-light",
  dark: process.env.SHIKI_DARK_THEME || "github-dark",
};

const LANGUAGE_ALIASES = new Map([
  ["shell", "sh"],
  ["shellsession", "sh"],
  ["console", "sh"],
  ["terminal", "sh"],
  ["plain", "text"],
  ["plaintext", "text"],
]);

function decodeHtml(value) {
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return "\"";
      if (lower === "apos" || lower === "#39") return "'";
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
      return match;
    });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAttribute(attrs, name) {
  const quoted = attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  if (quoted) return quoted[1];

  const bare = attrs.match(new RegExp(`\\b${name}=([^\\s>]+)`, "i"));
  return bare ? bare[1] : "";
}

function normalizeLang(lang) {
  const lower = (lang || "text").toLowerCase();
  return LANGUAGE_ALIASES.get(lower) || lower;
}

function styleObjectToString(style) {
  return Object.entries(style || {})
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function tokenScopes(token) {
  return (token.explanation || []).flatMap((part) =>
    (part.scopes || []).map((scope) => scope.scopeName || "")
  );
}

function classifyScopes(scopes) {
  const joined = scopes.join(" ");
  const classes = ["tok"];

  if (/\bcomment\b/.test(joined)) classes.push("tok-comment");
  if (/\bstring\b/.test(joined)) classes.push("tok-string");
  if (/\bconstant\b|\bnumber\b/.test(joined)) classes.push("tok-constant");
  if (/\bkeyword\.operator\b|\boperator\b/.test(joined)) classes.push("tok-operator");
  if (/\bkeyword\b|\bstorage\b/.test(joined)) classes.push("tok-keyword");
  if (/\bentity\.name\b|\bdecorator\b/.test(joined)) classes.push("tok-entity");
  if (/\bsupport\b/.test(joined)) classes.push("tok-support");
  if (/\bvariable\b/.test(joined)) classes.push("tok-variable");
  if (/\bpunctuation\b/.test(joined)) classes.push("tok-punctuation");

  return classes;
}

function renderToken(token) {
  const classes = classifyScopes(tokenScopes(token)).join(" ");
  const style = styleObjectToString(token.htmlStyle);
  const classAttr = classes ? ` class="${classes}"` : "";
  const styleAttr = style ? ` style="${style}"` : "";

  return `<span${classAttr}${styleAttr}>${escapeHtml(token.content)}</span>`;
}

function renderLine(inner, index) {
  return [
    '<span class="line">',
    `<span class="line-number" aria-hidden="true">${index + 1}</span>`,
    `<span class="line-code">${inner}</span>`,
    '</span>',
  ].join("");
}

function fallbackLines(code) {
  return code
    .split("\n")
    .map((line, index) => renderLine(escapeHtml(line), index))
    .join("");
}

async function highlight(code, lang) {
  if (!code) return "";

  try {
    const result = await codeToTokens(code, {
      lang: normalizeLang(lang),
      themes: THEMES,
      defaultColor: "light",
      includeExplanation: true,
    });

    return result.tokens
      .map((line, index) => renderLine(line.map(renderToken).join(""), index))
      .join("");
  } catch (error) {
    console.warn(`[shiki] ${lang}: ${error.message}`);
    return fallbackLines(code);
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      yield fullPath;
    }
  }
}

async function processFile(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const pattern = /<code\b([^>]*\bclass=["'][^"']*\bshiki-code\b[^"']*["'][^>]*)>([\s\S]*?)<\/code>/g;
  const matches = Array.from(source.matchAll(pattern));

  if (!matches.length) return 0;

  let cursor = 0;
  let output = "";
  let count = 0;

  for (const match of matches) {
    const [fullMatch, attrs, escapedCode] = match;
    const index = match.index ?? 0;
    output += source.slice(cursor, index);

    if (escapedCode.includes('class="line"') || escapedCode.includes("class='line'")) {
      output += fullMatch;
      cursor = index + fullMatch.length;
      continue;
    }

    const lang = getAttribute(attrs, "data-lang") || getAttribute(attrs, "data-language") || "text";
    const code = decodeHtml(escapedCode);
    const highlighted = await highlight(code, lang);
    const cleanAttrs = attrs.replace(/\sdata-raw-code=(["']).*?\1/i, "");
    output += `<code${cleanAttrs} data-raw-code="${encodeURIComponent(code)}">${highlighted}</code>`;
    cursor = index + fullMatch.length;
    count += 1;
  }

  output += source.slice(cursor);
  await fs.writeFile(filePath, output);
  return count;
}

let highlighted = 0;
for await (const filePath of walk(PUBLIC_DIR)) {
  highlighted += await processFile(filePath);
}

console.log(`[shiki] highlighted ${highlighted} code block${highlighted === 1 ? "" : "s"}`);
