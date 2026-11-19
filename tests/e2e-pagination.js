/* Pagination of list endpoints (admin). Run against a seeded test API. */
const BASE = process.env.TEST_API_URL || 'http://localhost:5055';
const PW = process.env.SEED_PASSWORD || 'Demo-pass1';
let pass = 0;
const failures = [];
const check = (name, cond) => (cond ? pass++ : failures.push('FAIL ' + name));
const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => null);
  return { status: res.status, total: res.headers.get('x-total-count'), data: j && j.data, body: j };
};

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', password: PW }),
  }).then((r) => r.json());
  const t = login.data.token;

  // create 3 contact messages through the public form
  for (let i = 0; i < 3; i++) {
    await fetch(BASE + '/api/public/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pager ' + i, email: 'p' + i + '@example.com', subject: 'Paging', message: 'Message number ' + i + ' for paging.' }),
    });
  }
  const all = await call('GET', '/api/admin/messages', t);
  check('messages 200', all.status === 200 && Array.isArray(all.data));
  check('total header matches', Number(all.total) === all.data.length && all.data.length >= 3);
  check('total_count not leaked', !('total_count' in all.data[0]));
  const p1 = await call('GET', '/api/admin/messages?limit=2&offset=0', t);
  const p2 = await call('GET', '/api/admin/messages?limit=2&offset=2', t);
  check('limit honoured', p1.data.length === 2);
  check('total header stable across pages', p1.total === all.total && p2.total === all.total);
  check('pages do not overlap', !p2.data.some((m) => p1.data.some((x) => x.message_id === m.message_id)));
  check('limit=0 rejected', (await call('GET', '/api/admin/messages?limit=0', t)).status === 400);
  check('limit>1000 rejected', (await call('GET', '/api/admin/messages?limit=5000', t)).status === 400);
  check('negative offset rejected', (await call('GET', '/api/admin/messages?offset=-1', t)).status === 400);
  check('junk limit rejected', (await call('GET', '/api/admin/messages?limit=abc', t)).status === 400);
  const beyond = await call('GET', '/api/admin/messages?offset=100000', t);
  check('offset past end -> empty list', beyond.status === 200 && beyond.data.length === 0 && beyond.total === '0');

  const fees = await call('GET', '/api/admin/fees?limit=1', t);
  check('fees paged', fees.status === 200 && fees.data.length <= 1 && fees.total !== null);
  const sc = await call('GET', '/api/admin/status-changes?limit=1&change_type=all', t);
  check('status-changes paged', sc.status === 200 && sc.data.length <= 1 && sc.total !== null);
  const anon = await fetch(BASE + '/api/admin/messages?limit=1');
  check('still requires auth', anon.status === 401);

  console.log(pass + ' passed, ' + failures.length + ' failed');
  failures.forEach((f) => console.log(f));
  process.exitCode = failures.length ? 1 : 0;
})();
