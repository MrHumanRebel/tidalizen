#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const buildDir = resolve(process.argv[2] || 'app');
const output = resolve(process.argv[3] || 'app/release/Tidalizen.wgt');
if (!existsSync(buildDir)) throw new Error(`Build directory not found: ${buildDir}`);
mkdirSync(dirname(output), { recursive: true });
const code = String.raw`
import os, sys, zipfile
build_dir = sys.argv[1]
output = sys.argv[2]
required = ['config.xml', 'index.html']
for name in required:
    if not os.path.isfile(os.path.join(build_dir, name)):
        raise SystemExit(f'missing required WGT file: {name}')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(build_dir):
        dirs[:] = [d for d in dirs if d not in {'.git','node_modules','release','.buildResult'}]
        for file in files:
            if file.endswith('.wgt'):
                continue
            path = os.path.join(root, file)
            arc = os.path.relpath(path, build_dir).replace(os.sep, '/')
            zf.write(path, arc)
print(output)
`;
const res = spawnSync('python3', ['-c', code, buildDir, output], { stdio: 'inherit' });
if (res.status !== 0) process.exit(res.status || 1);
const size = statSync(output).size;
if (size <= 0) throw new Error(`Created WGT is empty: ${output}`);
console.log(`Created ${output} (${size} bytes)`);
