// 하네스 공용 도구. 외부 패키지 없이 Node 표준 모듈만 쓴다(빈 프로젝트에서도 바로 동작하도록).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HARNESS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ROOT = path.resolve(HARNESS_DIR, '..');

/** Windows 경로도 보고서·비교에서는 항상 슬래시로 쓴다. */
export const toPosix = (p) => p.split(path.sep).join('/');
export const rel = (root, abs) => toPosix(path.relative(root, abs));

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadConfig(root = DEFAULT_ROOT) {
  return readJson(path.join(root, 'harness', 'harness.config.json'));
}

export function loadRules(root = DEFAULT_ROOT) {
  return readJson(path.join(root, 'harness', 'rules.json')).rules;
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'uploads']);

/** dir 아래 파일을 재귀로 모은다. filter(absPath) → boolean */
export function walk(dir, filter = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, filter, out);
    else if (entry.isFile() && filter(abs)) out.push(abs);
  }
  return out;
}

/** 마크다운에서 펜스 코드 블록(```) 안의 줄을 빈 줄로 바꾼다. 줄 번호는 유지된다. */
export function stripFences(text) {
  let inFence = false;
  return text.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return '';
    }
    return inFence ? '' : line;
  });
}

/** 하네스가 읽는 마크다운 문서 목록: 루트의 md + docs/ + .claude/skills/ */
export function docFiles(root, config) {
  const files = [];
  for (const name of config.docs?.rootFiles ?? ['AGENTS.md', 'CLAUDE.md', 'README.md']) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs)) files.push(abs);
  }
  for (const dir of config.docs?.dirs ?? ['docs', '.claude/skills']) {
    walk(path.join(root, dir), (f) => f.endsWith('.md') && !f.includes(`${path.sep}evals${path.sep}`), files);
  }
  // 이력 문서(devlog, changelog)는 그 시점의 사실을 적은 것이라 지금 코드와 맞출 대상이 아니다
  // "/"로 끝나는 항목은 폴더 전체를 뺀다 (예: "docs/devlog/")
  const entries = config.docs?.exclude ?? [];
  const exclude = new Set(entries.filter((p) => !p.endsWith('/')).map((p) => path.join(root, p)));
  const excludeDirs = entries.filter((p) => p.endsWith('/')).map((p) => path.join(root, p));
  return files.filter((f) => !exclude.has(f) && !excludeDirs.some((d) => f.startsWith(d)));
}

/** 검사 결과 그릇 */
export function result() {
  return { errors: [], warnings: [], notes: [] };
}

/** 스크립트로 직접 실행됐는지 (import될 때는 main을 돌리지 않기 위해) */
export function isMain(metaUrl) {
  return process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

export async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
