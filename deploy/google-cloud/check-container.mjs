// Tests a built image with an isolated, automatically removed Docker volume.
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
const image = process.argv[2] || 'na-distributors:cloud-test';
const name = 'na-deploy-check-' + randomUUID().slice(0, 8);
const volume = name + '-data';
const dockerEnv = { ...process.env, SETUP_TOKEN: randomBytes(24).toString('hex') };
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: dockerEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const common = String.raw`
import assert from 'node:assert/strict';
let cookie='',csrf='';
async function request(path,method='GET',body){const r=await fetch('http://127.0.0.1:3001/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return {status:r.status,data};}
const password='Container-check-only-2026';
`;
async function ready() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      docker(
        'exec',
        name,
        'node',
        '-e',
        "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('The test container did not become healthy.');
}
try {
  docker('volume', 'create', volume);
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '-e',
    'SETUP_TOKEN',
    '-e',
    'COOKIE_SECURE=true',
    '-e',
    'TRUST_PROXY_HOPS=1',
    '--mount',
    `type=volume,source=${volume},target=/data`,
    image,
  );
  await ready();
  console.log(
    docker(
      'exec',
      name,
      'node',
      '--input-type=module',
      '-e',
      common +
        String.raw`
const html=await fetch('http://127.0.0.1:3001/');assert.equal(html.status,200);assert.match(await html.text(),/NA Distributors/);
assert.equal((await request('/auth/setup','POST',{password})).status,403);
const setup=await request('/auth/setup','POST',{password,setupToken:process.env.SETUP_TOKEN});assert.equal(setup.status,200);
assert.equal((await request('/products')).data.length,0);assert.equal((await request('/customers')).data.length,0);assert.equal((await request('/orders')).data.length,0);
assert.equal((await request('/users')).data.users.length,3);
const product=await request('/products','POST',{name:'Container test spice',sku:'CONTAINER-TEST',stock:6,cost:300,mrp:500});assert.equal(product.status,201);
const customer=await request('/customers','POST',{business:'Container test account',tier:'mrp'});assert.equal(customer.status,201);
const order=await request('/orders','POST',{customer_id:customer.data.id,items:[{product_id:product.data.id,quantity:2}],initial_paid:100});assert.equal(order.status,201);assert.equal(order.data.total,1000);assert.equal(order.data.balance,900);
assert.equal((await request('/products')).data[0].stock,4);
console.log('Container: web UI, private setup code, blank initialization and order transaction passed.');
`,
    ),
  );
  docker('restart', '--time', '15', name);
  await ready();
  console.log(
    docker(
      'exec',
      name,
      'node',
      '--input-type=module',
      '-e',
      common +
        String.raw`
assert.equal((await request('/auth/status')).data.setupRequired,false);
assert.equal((await request('/auth/login','POST',{username:'naween',password})).status,200);
assert.equal((await request('/products')).data[0].stock,4);
assert.equal((await request('/orders')).data[0].total,1000);
assert.equal((await request('/orders')).data[0].balance,900);
console.log('Container: admin account, products, stock, invoice and payment persisted across restart.');
`,
    ),
  );
} finally {
  try {
    docker('rm', '-f', name);
  } catch {}
  try {
    docker('volume', 'rm', volume);
  } catch {}
}
