import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
class Session {
  cookies = new Map();
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(';')[0].split('=');
      this.cookies.set(key, value.join('='));
    }
    return response;
  }
  async json(path, options = {}) {
    const response = await this.request(path, options);
    const data = await response.json().catch(() => ({}));
    assert(response.ok, `${response.status}: ${JSON.stringify(data)}`);
    return data;
  }
  async create(kind) {
    return this.json('/api/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) });
  }
}

const desktop = new Session();
const phone = new Session();

assert.equal((await desktop.json('/api/health')).ok, true);

const transfer = await desktop.create('send');
assert.match(transfer.code, /^\d{6}$/);
assert.equal(transfer.status, 'pending');
assert.equal(transfer.fileCount, 0);

const public_ = await phone.json(`/api/transfers/${transfer.code}`);
assert.equal(public_.isOwner, false);
assert.equal(public_.ownerId, undefined);

// Without Supabase configured, the sanity check surfaces a clear message rather than
// silently accepting an upload the storage layer cannot fulfil.
const beginResponse = await desktop.request(`/api/transfers/${transfer.code}/files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'notes.txt', size: 42, mime: 'text/plain' }),
});
assert.equal(beginResponse.status, 500);
assert.match((await beginResponse.json()).error, /Supabase/);

const denied = await phone.request(`/api/transfers/${transfer.code}/files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'notes.txt', size: 42, mime: 'text/plain' }),
});
assert.equal(denied.status, 409);
assert.match((await denied.json()).error, /لینک برای دریافت فایل/);

const downloadResponse = await phone.request(`/api/transfers/${transfer.code}/download?file=abc`);
assert.equal(downloadResponse.status, 404);

const deleted = await phone.request(`/api/transfers/${transfer.code}`, { method: 'DELETE' });
assert.equal(deleted.status, 403);

await desktop.json('/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Automated Supabase readiness check: metadata endpoints respond correctly.' }),
});

const removal = await desktop.json(`/api/transfers/${transfer.code}`, { method: 'DELETE' });
assert.equal(removal.ok, true);
assert.equal((await phone.request(`/api/transfers/${transfer.code}`)).status, 404);
console.log('PASS: metadata endpoints, access control, feedback, deletion, and Supabase misconfiguration guidance.');
