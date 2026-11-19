/* Phase 5 feature checks (run after e2e-security.js on the same DB). */
const BASE = process.env.TEST_API_URL || 'http://localhost:5055';
let pass = 0, fail = 0; const out = [];
const check = (n, c, x = '') => (c ? pass++ : (fail++, out.push(`FAIL ${n} ${x}`)));
const req = async (method, path, { token, body } = {}) => {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`;
  let payload; if (body instanceof FormData) payload = body; else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: payload });
  const text = await r.text(); let raw; try { raw = JSON.parse(text); } catch { raw = text; }
  return { status: r.status, raw, json: raw && raw.success === true ? raw.data : raw, headers: r.headers, text };
};
const tok = async (email, password) => (await req('POST', '/api/auth/login', { body: { email, password } })).json?.token;
const form = (fields, buf, type, name) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); if (buf) fd.append('file', new Blob([buf], { type }), name); return fd; };
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%test\n');

(async () => {
  const admin = await tok('admin@test.com', 'Demo-pass1');
  const teacher = await tok('teacher@test.com', 'Teach-pass2'); // changed by the security suite
  const student = await tok('student@test.com', 'Demo-pass1');
  check('logins', admin && teacher && student);

  // envelope shape
  const env = await req('GET', '/api/admin/dashboard', { token: admin });
  check('success envelope', env.raw.success === true && typeof env.raw.data === 'object');
  const err = await req('GET', '/api/admin/dashboard');
  check('error envelope', err.raw.success === false && typeof err.raw.message === 'string');
  const msgEnv = await req('PUT', '/api/students/payment-window', { token: student, body: { payment_window: 'monthly' } });
  check('plain object payload', msgEnv.raw.success === true && msgEnv.raw.data.payment_window === 'monthly');

  // public site
  const teachers = await req('GET', '/api/public/teachers');
  check('public teachers', teachers.status === 200 && teachers.json.length >= 1 && !('email' in teachers.json[0]) && !('phone' in teachers.json[0]));
  const levels = await req('GET', '/api/public/levels');
  check('public levels with fees', levels.json.length === 8 && levels.json[0].fees.length === 4, JSON.stringify(levels.json[0]));
  check('contact invalid 400', (await req('POST', '/api/public/contact', { body: { name: 'A', email: 'bad', message: '' } })).status === 400);
  const c = await req('POST', '/api/public/contact', { body: { name: 'Riya', email: 'riya@example.com', phone: '9876543210', subject: 'Admission', message: 'Hello!' } });
  check('contact stored', c.status === 201 && /received/.test(c.raw.message));
  const msgs = await req('GET', '/api/admin/messages', { token: admin });
  check('admin sees message', msgs.json.length === 1 && msgs.json[0].is_read === false);
  check('dashboard unread count', (await req('GET', '/api/admin/dashboard', { token: admin })).json.unread_messages === 1);
  check('mark read', (await req('PUT', `/api/admin/messages/${msgs.json[0].message_id}`, { token: admin, body: { is_read: true } })).json.contactMessage.is_read === true);
  check('student cannot read messages', (await req('GET', '/api/admin/messages', { token: student })).status === 403);

  // admin add student + invite
  const ns = await req('POST', '/api/admin/students', { token: admin, body: { email: 'kavya@test.com', full_name: 'Kavya Rao', phone: '9811111111', current_level_id: 1, payment_window: 'monthly', batch_id: 1 } });
  check('admin create student', ns.status === 201 && /set-password\?token=/.test(ns.json.invite.url), JSON.stringify(ns.raw));
  const t = decodeURIComponent(ns.json.invite.url.split('token=')[1]);
  check('student sets password', (await req('POST', '/api/auth/set-password', { body: { token: t, password: 'Kavya-pass1' } })).status === 200);
  const kavya = await tok('kavya@test.com', 'Kavya-pass1');
  check('new student logs in, has batch', (await req('GET', '/api/students/schedule', { token: kavya })).json.batchInfo?.batchName === 'Demo Evening Batch');
  check('student reset link', (await req('POST', `/api/admin/students/${ns.json.student.student_id}/invite`, { token: admin })).json.invite.purpose === 'reset');
  check('duplicate student email 409', (await req('POST', '/api/admin/students', { token: admin, body: { email: 'KAVYA@test.com', full_name: 'X', current_level_id: 1 } })).status === 409);

  // resources
  const pdfUp = await req('POST', '/api/teachers/resources', { token: teacher, body: form({ title: 'Hastak guide', level_id: '1' }, PDF, 'application/pdf', 'guide.pdf') });
  check('teacher uploads pdf', pdfUp.status === 201 && pdfUp.json.resource.resource_type === 'document' && pdfUp.json.resource.file_size, JSON.stringify(pdfUp.raw));
  const link = await req('POST', '/api/teachers/resources', { token: teacher, body: { title: 'Teen taal video', external_url: 'https://www.youtube.com/watch?v=abc', resource_type: 'video', level_id: 2 } });
  check('teacher adds link', link.status === 201 && link.json.resource.is_external === true, JSON.stringify(link.raw));
  check('http link rejected', (await req('POST', '/api/teachers/resources', { token: teacher, body: { title: 'x', external_url: 'http://insecure.example' } })).status === 400);
  check('neither file nor link 400', (await req('POST', '/api/teachers/resources', { token: teacher, body: { title: 'x' } })).status === 400);
  check('html as pdf rejected', (await req('POST', '/api/teachers/resources', { token: teacher, body: form({ title: 'x' }, Buffer.from('<html>'), 'application/pdf', 'a.pdf') })).status === 400);
  check('teacher lists own', (await req('GET', '/api/teachers/resources', { token: teacher })).json.length === 2);
  const sres = await req('GET', '/api/students/resources', { token: student });
  check('student sees own-level only', sres.json.length === 1 && sres.json[0].title === 'Hastak guide', JSON.stringify(sres.json));
  const file = await req('GET', `/api/resources/${pdfUp.json.resource.id}/file`, { token: student });
  check('student downloads resource', file.status === 200 && file.headers.get('content-type') === 'application/pdf');
  check('student blocked other level', (await req('GET', `/api/resources/${link.json.resource.id}/file`, { token: student })).status === 404);
  check('no anon download', (await req('GET', `/api/resources/${pdfUp.json.resource.id}/file`)).status === 401);
  check('student cannot upload resource', (await req('POST', '/api/teachers/resources', { token: student, body: { title: 'x', external_url: 'https://a.b' } })).status === 403);
  check('teacher deletes resource', (await req('DELETE', `/api/teachers/resources/${link.json.resource.id}`, { token: teacher })).status === 200);

  // admin gallery management
  const g = await req('POST', '/api/admin/gallery', { token: admin, body: form({ title: 'Annual Day', category: 'Events' }, PNG, 'image/png', 'a.png') });
  check('admin gallery upload', g.status === 201 && g.json.item.is_visible === true, JSON.stringify(g.raw));
  const pub = await req('GET', '/api/gallery');
  check('appears publicly', pub.json.some((i) => i.title === 'Annual Day'));
  const name = g.json.item.media_url.split('/').pop();
  check('public media served', (await req('GET', `/uploads/${name}`)).status === 200);
  await req('PUT', `/api/admin/gallery/${g.json.item.id}`, { token: admin, body: { is_visible: false } });
  check('hidden not public', (await req('GET', `/uploads/${name}`)).status === 404 && !(await req('GET', '/api/gallery')).json.some((i) => i.title === 'Annual Day'));
  check('admin lists all', (await req('GET', '/api/admin/gallery', { token: admin })).json.length >= 1);
  const prev = await req('GET', `/api/admin/gallery/${g.json.item.id}/file`, { token: admin });
  check('admin previews hidden item', prev.status === 200 && prev.headers.get('content-type') === 'image/png');
  check('student cannot preview admin file', (await req('GET', `/api/admin/gallery/${g.json.item.id}/file`, { token: student })).status === 403);

  // dates are plain calendar strings (no timezone shift)
  const att = await req('GET', '/api/students/attendance', { token: student });
  check('dates as YYYY-MM-DD', att.json.records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.attendance_date)), JSON.stringify(att.json.records[0]));

  // batch switch history stores batch names
  const nb = await req('POST', '/api/admin/batches', { token: admin, body: { batch_name: 'Switch Test', level_id: 1, teacher_id: 1, schedule: 'Sat', time: '9 AM' } });
  const kid = (await req('GET', '/api/admin/students?search=kavya', { token: admin })).json[0];
  await req('PUT', `/api/admin/students/${kid.student_id}`, { token: admin, body: { batch_id: nb.json.batch.batch_id } });
  const sw = (await req('GET', '/api/admin/status-changes?change_type=batch_switch', { token: admin })).json;
  check('batch switch shows names', sw.some((c) => c.status_from === 'Demo Evening Batch' && c.status_to === 'Switch Test'), JSON.stringify(sw));
  check('gallery delete', (await req('DELETE', `/api/admin/gallery/${g.json.item.id}`, { token: admin })).status === 200);

  // teacher dashboard real data
  const td = await req('GET', '/api/teachers/dashboard', { token: teacher });
  check('teacher dashboard fields', Array.isArray(td.json.today_batches) && typeof td.json.classes_today === 'number' && typeof td.json.pending_attendance === 'number', JSON.stringify(td.json));

  console.log(`\n${pass} passed, ${fail} failed`); out.forEach((l) => console.log(l));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
