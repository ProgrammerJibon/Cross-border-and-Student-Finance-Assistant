import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/);
const text=files.filter(f=>/\.(?:ts|tsx|mjs|js|json|sql|md|yml|css)$/.test(f)&&f!=='changes.md'&&f!=='package-lock.json'&&!f.startsWith('docs/REPOSITORY_REVIEW'));
const inventory=[];
for(const file of text) {
  if(!existsSync(file))continue;
  const content=readFileSync(file,'utf8');
  inventory.push(`| [${file}](../${file}) | ${content.split('\n').length} | ${createHash('sha256').update(content).digest('hex').slice(0,12)} | ${(content.match(/UPDATE\s+accounts|INSERT\s+INTO\s+(?:financial|wallet)|requireDemoFinance|requireSameEnvironment/g)||[]).length} |`);
}
writeFileSync('docs/REPOSITORY_REVIEW_2026-10-25.md',`# Repository review inventory\n\nAutomated content inventory of source, database, tests, configuration and documentation. Financial services, actions, authentication, authorization, migration and UI paths received targeted manual inspection. This is not an assertion of a complete independent audit. Binaries and package lock were inventoried separately. The user-supplied requirements document was read but excluded from content hashes and reports because it contains bootstrap credentials.\n\n| File | Lines | SHA-256 prefix | Financial boundary matches |\n|---|---:|---|---:|\n${inventory.join('\n')}\n`);
console.log(`Inventoried ${inventory.length} text files without copying source contents or credentials.`);
