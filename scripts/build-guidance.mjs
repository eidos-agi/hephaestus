import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canonical, sha256, validateRelease } from '../src/schema.ts';

export async function buildRelease() {
  const catalog = JSON.parse(await readFile(new URL('../guidance/catalog.json',import.meta.url),'utf8'));
  const topics=[];
  for (const topic of catalog.topics) {
    if (!/^skills\/hephaestus\/references\/[a-z-]+\.md$/.test(topic.path)) throw new Error('Invalid topic path');
    const text=await readFile(new URL('../'+topic.path,import.meta.url),'utf8');
    topics.push({...topic,hash:await sha256(text),text});
  }
  const body={schema_version:1,...catalog,topics};
  return validateRelease({...body,revision:await sha256(canonical(body))});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const release=await buildRelease();
  await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
  await writeFile(new URL('../dist/release.json',import.meta.url),JSON.stringify(release,null,2)+'\n');
  console.log(JSON.stringify({revision:release.revision,topics:release.topics.length,bytes:JSON.stringify(release).length}));
}

