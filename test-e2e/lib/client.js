// Thin fetch wrapper — no supertest/jest, per "keep dependencies minimal".
// Node 18+ ships fetch/FormData/Blob natively.

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let fetchBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: fetchBody });
  const contentType = res.headers.get('content-type') || '';
  let json = null;
  let buffer = null;
  if (contentType.includes('application/json')) {
    json = await res.json().catch(() => null);
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
  }
  return { status: res.status, json, buffer, headers: res.headers };
}

function makeClient(baseUrl) {
  return {
    get: (path, opts) => request(baseUrl, 'GET', path, opts),
    post: (path, opts) => request(baseUrl, 'POST', path, opts),
    patch: (path, opts) => request(baseUrl, 'PATCH', path, opts),
    del: (path, opts) => request(baseUrl, 'DELETE', path, opts),

    async upload(path, { token, buffer, filename, fieldName = 'file' } = {}) {
      const form = new FormData();
      form.append(fieldName, new Blob([buffer]), filename);
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: form });
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    },
  };
}

module.exports = { makeClient };
