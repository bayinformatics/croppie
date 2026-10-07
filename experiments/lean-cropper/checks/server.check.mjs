import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = await mkdtemp(join(repo, 'experiments/lean-cropper/dist/server-check-'));
const outside = await mkdtemp(join(tmpdir(), 'lean-server-check-'));
const server = spawn('bun', ['experiments/lean-cropper/serve.ts'], {
  cwd: repo, env: {...process.env, LEAN_PORT:'0'}, stdio:['ignore','pipe','pipe'],
});
let errors = ''; server.stderr.on('data', data => { errors += data; });
try {
  const [ready] = await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error(errors);})]);
  const origin = new URL(String(ready).match(/http:\/\/\S+/)[0]).origin;
  const route = '/'+assets.slice(repo.length+1);
  await writeFile(join(assets,'allowed.txt'),'public asset');
  await writeFile(join(outside,'private.txt'),'private test sentinel');
  await symlink(join(outside,'private.txt'),join(assets,'outside.txt'));
  assert.equal(await (await fetch(origin+route+'/allowed.txt')).text(),'public asset');
  for (const path of ['/experiments/lean-cropper/dist/','/experiments/lean-cropper/checks/harness.html','/docs/images/garden-1600.jpg']) {
    assert.equal((await fetch(origin+path)).status,200,path);
  }
  assert.equal((await fetch(origin+'/package.json')).status,404);
  assert.equal((await fetch(origin+route+'/outside.txt')).status,403);
  assert.equal((await fetch(origin+'/experiments/lean-cropper/dist/%2e%2e%2fREADME.md')).status,403);
  const hostileHostStatus = await new Promise((resolve,reject) => {
    const req = request(origin+'/',{headers:{Host:'review-test.invalid'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(hostileHostStatus,403);
  assert.equal((await fetch(origin+'/',{headers:{Origin:'https://review-test.invalid'}})).status,403);
  assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/experiments/lean-cropper/dist/',{method:'HEAD'})).status,200);
  console.log('Demo server: allowed assets, repository isolation, symlinks, traversal, Host, Origin and methods passed');
} finally {
  server.kill();
  await rm(assets,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true});
}
