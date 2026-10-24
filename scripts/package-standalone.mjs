import { cp, readdir, rm } from "node:fs/promises";
import { resolve, relative } from "node:path";
const root = resolve(".next/standalone");
// Next's standalone output may copy dotenv files independently of NFT exclusions.
// Remove only secret environment files within this verified artifact directory.
async function stripSecrets(dir) {
  if (relative(root, dir).startsWith("..")) throw new Error("Invalid artifact path");
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await stripSecrets(path);
    else if (entry.name === ".env" || entry.name.startsWith(".env.")) await rm(path);
  }
}
await stripSecrets(root);
await cp("public", resolve(root,"public"), {recursive:true});
await cp(".next/static", resolve(root,".next/static"), {recursive:true});
console.log("Standalone packaged without dotenv files. Supply secrets at runtime.");
