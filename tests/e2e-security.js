/* End-to-end checks against the throwaway test API (port 5055). */
const BASE = process.env.TEST_API_URL || 'http://localhost:5055';
const PW = 'Demo-pass1';
let pass = 0, fail = 0;
const results = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fail++; results.push(`FAIL ${name} ${extra}`); }
};

const req = async (method, path, { token, body, headers = {}, raw } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body instanceof FormData) payload = body;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers: h, body: payload });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  // Unwrap the { success: true, data } envelope; errors stay as-is.
  const json = parsed && parsed.success === true && 'data' in parsed ? parsed.data : parsed;
  return { status: res.status, json, raw: parsed, headers: res.headers };
};
const login = async (email, password = PW) => (await req('POST', '/api/auth/login', { body: { email, password } }));
const tokenOf = async (email, password = PW) => (await login(email, password)).json?.token;

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const fileForm = (fields, buf, type, name) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([buf], { type }), name);
  return fd;
};

(async () => {
  // ── C1 seed endpoints removed
  check('seed POST gone', (await req('POST', '/api/seed/test-accounts')).status === 404);
  check('seed DELETE gone', (await req('DELETE', '/api/seed/test-accounts')).status === 404);

  // ── login basics / enumeration
  const bad = await login('admin@test.com', 'wrong-pass1');
  const unknown = await login('nobody@test.com', 'wrong-pass1');
  check('bad password 401', bad.status === 401);
  check('unknown email same response', unknown.status === 401 && unknown.json.message === bad.json.message);
  const admin = await tokenOf('admin@test.com');
  const teacher = await tokenOf('teacher@test.com');
  const student = await tokenOf('student@test.com');
  check('logins ok', admin && teacher && student);
  check('case-insensitive email login', !!(await tokenOf('ADMIN@test.com')));

  // ── role checks / JWT validation
  check('no token 401', (await req('GET', '/api/admin/dashboard')).status === 401);
  check('student->admin 403', (await req('GET', '/api/admin/dashboard', { token: student })).status === 403);
  check('teacher->student 403', (await req('GET', '/api/students/dashboard', { token: teacher })).status === 403);
  check('student->teacher 403', (await req('GET', '/api/teachers/profile', { token: student })).status === 403);
  const noneAlg = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' +
    Buffer.from('{"sub":"1","role":"admin"}').toString('base64url') + '.';
  check('alg=none rejected', (await req('GET', '/api/admin/dashboard', { token: noneAlg })).status === 401);
  const [h, p, s] = student.split('.');
  const forged = h + '.' + Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'admin' })).toString('base64url') + '.' + s;
  check('forged role rejected', (await req('GET', '/api/admin/dashboard', { token: forged })).status === 401);

  // ── security headers & CORS
  const hdr = await req('GET', '/', { headers: { Origin: 'https://evil.example' } });
  check('helmet nosniff', hdr.headers.get('x-content-type-options') === 'nosniff');
  check('no x-powered-by', !hdr.headers.get('x-powered-by'));
  check('CORS blocks unknown origin', !hdr.headers.get('access-control-allow-origin'));
  const ok = await req('GET', '/', { headers: { Origin: 'http://localhost:3000' } });
  check('CORS allows frontend', ok.headers.get('access-control-allow-origin') === 'http://localhost:3000');

  // ── error hygiene
  const malformed = await req('POST', '/api/auth/login', { raw: '{bad json', headers: { 'Content-Type': 'application/json' } });
  check('malformed JSON 400 clean', malformed.status === 400 && !JSON.stringify(malformed.json).includes('SyntaxError'));
  const badId = await req('GET', '/api/admin/students/abc', { token: admin });
  check('invalid id 400', badId.status === 400);

  // ── registration: validation, transaction, duplicate
  check('weak password rejected', (await req('POST', '/api/auth/register', { body: { email: 'w@test.com', password: 'abc', fullName: 'W', phone: '9999999999' } })).status === 400);
  const regBody = { email: 'newkid@test.com', password: 'Kathak-123', fullName: 'New Kid', phone: '9876501234',
    gender: 'female', emergencyContactName: 'Mom', emergencyContact: '9876500000', currentLevelId: 2,
    paymentWindow: 'quarterly', enrollmentReason: 'Love dance' };
  const reg = await req('POST', '/api/auth/register', { body: regBody });
  check('register 201', reg.status === 201, JSON.stringify(reg.json));
  check('register keeps fields', reg.json?.user?.profile?.payment_window === 'quarterly' && reg.json?.user?.profile?.emergency_contact_name === 'Mom');
  check('roll number generated', /^PM\d+$/.test(reg.json?.user?.profile?.roll_number || ''), reg.json?.user?.profile?.roll_number);
  check('duplicate register 409', (await req('POST', '/api/auth/register', { body: { ...regBody, email: 'NEWKID@test.com' } })).status === 409);
  const newKid = reg.json?.token;

  // ── C2 SQL injection in activity-log update
  const log = await req('POST', '/api/students/activity-logs', { token: student, body: { log_date: '2026-11-01', activities_done: 'Tatkar', practice_hours: 2 } });
  check('log create 201', log.status === 201, JSON.stringify(log.json));
  const logId = log.json.log_id;
  const inj1 = await req('PUT', `/api/students/activity-logs/${logId}`, { token: student,
    body: { "notes = (SELECT password_hash FROM users LIMIT 1), mood": 'x' } });
  check('injection-only body rejected', inj1.status === 400);
  const inj2 = await req('PUT', `/api/students/activity-logs/${logId}`, { token: student,
    body: { mood: 'happy', "notes = (SELECT password_hash FROM users LIMIT 1), mood": 'x', student_id: 999 } });
  check('injection key ignored', inj2.status === 200 && inj2.json.mood === 'happy' && !String(inj2.json.notes || '').startsWith('$2') && inj2.json.student_id !== 999, JSON.stringify(inj2.json));
  const upd = await req('PUT', `/api/students/activity-logs/${logId}`, { token: student, body: { practice_hours: 5 } });
  const stats = await req('GET', '/api/students/activity-logs/stats', { token: student });
  check('practice hours delta', upd.status === 200 && stats.json.total_practice_hours === 5, JSON.stringify(stats.json));
  check('dup log date 409', (await req('POST', '/api/students/activity-logs', { token: student, body: { log_date: '2026-11-01' } })).status === 409);
  check('other student cannot edit log', (await req('PUT', `/api/students/activity-logs/${logId}`, { token: newKid, body: { mood: 'x' } })).status === 404);

  // ── C3 teacher invitation flow
  const ct = await req('POST', '/api/admin/teachers', { token: admin, body: { email: 'meera@test.com', fullName: 'Meera Iyer', password: 'password123', specialization: 'Jaipur' } });
  check('create teacher 201', ct.status === 201, JSON.stringify(ct.json));
  check('invite link returned', /set-password\?token=/.test(ct.json?.invite?.url || ''));
  check('no shared default password', (await login('meera@test.com', 'password123')).status === 401);
  const inviteToken = decodeURIComponent((ct.json.invite.url.split('token=')[1]));
  const chk = await req('GET', `/api/auth/password-setup/${encodeURIComponent(inviteToken)}`);
  check('invite token valid', chk.status === 200 && chk.json.email === 'meera@test.com');
  check('set weak password 400', (await req('POST', '/api/auth/set-password', { body: { token: inviteToken, password: 'short' } })).status === 400);
  check('set password 200', (await req('POST', '/api/auth/set-password', { body: { token: inviteToken, password: 'Meera-pass9' } })).status === 200);
  check('invite token single-use', (await req('POST', '/api/auth/set-password', { body: { token: inviteToken, password: 'Meera-pass8' } })).status === 400);
  const meera = await tokenOf('meera@test.com', 'Meera-pass9');
  check('teacher logs in with own password', !!meera);
  const meeraId = ct.json.teacher.teacher_id;

  // ── inactive & deleted users lose access immediately
  check('deactivate teacher', (await req('PUT', `/api/admin/teachers/${meeraId}`, { token: admin, body: { is_active: false } })).status === 200);
  check('deactivated token rejected', (await req('GET', '/api/teachers/profile', { token: meera })).status === 401);
  check('deactivated login 403', (await login('meera@test.com', 'Meera-pass9')).status === 403);
  await req('PUT', `/api/admin/teachers/${meeraId}`, { token: admin, body: { is_active: true } });
  check('reactivated works', (await req('GET', '/api/teachers/profile', { token: meera })).status === 200);
  const newKidId = reg.json.user.profile.student_id;
  check('delete student 200', (await req('DELETE', `/api/admin/students/${newKidId}`, { token: admin })).status === 200);
  check('deleted user token rejected', (await req('GET', '/api/students/dashboard', { token: newKid })).status === 401);
  check('deleted user login fails', (await login('newkid@test.com', 'Kathak-123')).status === 401);
  check('delete teacher (no batches) ok', (await req('DELETE', `/api/admin/teachers/${meeraId}`, { token: admin })).status === 200);
  check('deleted teacher token rejected', (await req('GET', '/api/teachers/profile', { token: meera })).status === 401);

  // ── password change invalidates other sessions
  const t2 = await tokenOf('teacher@test.com');
  await new Promise((r) => setTimeout(r, 1100));
  const cp = await req('PUT', '/api/auth/change-password', { token: t2, body: { currentPassword: PW, newPassword: 'Teach-pass2' } });
  check('change password 200', cp.status === 200 && cp.json.token);
  check('old session rejected after change', (await req('GET', '/api/teachers/profile', { token: teacher })).status === 401);
  const teacherNew = cp.json.token;
  check('new session works', (await req('GET', '/api/teachers/profile', { token: teacherNew })).status === 200);

  // ── uploads
  const up = await req('POST', '/api/gallery-requests/student/upload', { token: student, body: fileForm({ title: 'Solo', category: 'Performances' }, PNG, 'image/png', 'evil.html') });
  check('valid png upload 201', up.status === 201, JSON.stringify(up.json));
  check('stored name randomized .png', /^\/uploads\/[0-9a-f-]{36}\.png$/.test(up.json.file_url || ''), up.json.file_url);
  check('media_type derived', up.json.media_type === 'photo');
  const html = Buffer.from('<html><script>alert(1)</script></html>');
  check('html disguised as png rejected', (await req('POST', '/api/gallery-requests/student/upload', { token: student, body: fileForm({ title: 'x' }, html, 'image/png', 'a.png') })).status === 400);
  check('svg rejected', (await req('POST', '/api/gallery-requests/student/upload', { token: student, body: fileForm({ title: 'x' }, Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg') })).status === 400);
  check('html type rejected', (await req('POST', '/api/gallery-requests/student/upload', { token: student, body: fileForm({ title: 'x' }, html, 'text/html', 'a.html') })).status === 400);
  check('upload without title 400', (await req('POST', '/api/gallery-requests/student/upload', { token: student, body: fileForm({}, PNG, 'image/png', 'a.png') })).status === 400);
  check('teacher cannot upload', (await req('POST', '/api/gallery-requests/student/upload', { token: teacherNew, body: fileForm({ title: 'x' }, PNG, 'image/png', 'a.png') })).status === 403);
  const fname = up.json.file_url.split('/').pop();
  check('pending file not public', (await req('GET', `/uploads/${fname}`)).status === 404);
  check('path traversal blocked', (await req('GET', '/uploads/..%2f..%2fserver.js')).status === 404);
  const own = await req('GET', `/api/gallery-requests/${up.json.id}/file`, { token: student });
  check('owner can view pending', own.status === 200 && own.headers.get('content-type') === 'image/png');
  check('media CSP sandbox', /sandbox/.test(own.headers.get('content-security-policy') || ''));
  const sid2 = (await req('POST', '/api/auth/register', { body: { ...regBody, email: 'other@test.com' } })).json.token;
  check('other student cannot view', (await req('GET', `/api/gallery-requests/${up.json.id}/file`, { token: sid2 })).status === 404);
  check('student sees own requests', (await req('GET', '/api/gallery-requests/student', { token: student })).json.length === 1);
  check('other sees none', (await req('GET', '/api/gallery-requests/student', { token: sid2 })).json.length === 0);
  const adminList = await req('GET', '/api/gallery-requests/admin', { token: admin });
  check('admin list works', adminList.status === 200 && adminList.json[0].student_name === 'Asha Patil', JSON.stringify(adminList.json).slice(0, 200));
  check('approve 200', (await req('PUT', `/api/gallery-requests/admin/${up.json.id}/status`, { token: admin, body: { status: 'approved' } })).status === 200);
  check('approved file public', (await req('GET', `/uploads/${fname}`)).status === 200);
  check('approved in public gallery', (await req('GET', '/api/gallery')).json.length === 1);
  await req('PUT', `/api/gallery-requests/admin/${up.json.id}/status`, { token: admin, body: { status: 'rejected', rejection_reason: 'Blurry' } });
  check('rejected file hidden again', (await req('GET', `/uploads/${fname}`)).status === 404);
  check('rejected removed from gallery', (await req('GET', '/api/gallery')).json.length === 0);

  // ── notices: visibility + CRUD with frontend field names
  const mk = (b) => req('POST', '/api/notices', { token: admin, body: b });
  const n1 = await mk({ title: 'For all', content: 'Hello', target_audience: 'all', category: 'event', is_important: true });
  check('notice create 201', n1.status === 201 && n1.json.id && n1.json.content === 'Hello' && n1.json.is_important === true, JSON.stringify(n1.json));
  await mk({ title: 'Students only', content: 'S', target_audience: 'students' });
  await mk({ title: 'Teachers only', content: 'T', target_audience: 'teachers' });
  await mk({ title: 'Draft', content: 'D', status: 'draft' });
  const guest = await req('GET', '/api/notices');
  check('guest sees only public', guest.json.length === 1, guest.json.map((n) => n.title).join());
  check('student sees all+students', (await req('GET', '/api/notices', { token: student })).json.length === 2);
  check('teacher sees all+teachers', (await req('GET', '/api/notices', { token: teacherNew })).json.length === 2);
  check('category filter', (await req('GET', '/api/notices?category=event')).json.length === 1);
  check('admin sees drafts', (await req('GET', '/api/notices/admin', { token: admin })).json.length === 4);
  check('notice update', (await req('PUT', `/api/notices/${n1.json.id}`, { token: admin, body: { title: 'Edited', content: 'X' } })).json.title === 'Edited');
  check('notice delete', (await req('DELETE', `/api/notices/${n1.json.id}`, { token: admin })).status === 200);
  check('student dashboard notices', (await req('GET', '/api/students/dashboard', { token: student })).json.recentNotices.length === 1);

  // ── admin data paths (schema reconciliation)
  const students = await req('GET', '/api/admin/students?status=active&search=asha', { token: admin });
  check('students list+filters', students.status === 200 && students.json.length === 1, JSON.stringify(students.json));
  const ashaId = students.json[0].student_id;
  check('student details', (await req('GET', `/api/admin/students/${ashaId}`, { token: admin })).json.batch_name === 'Demo Evening Batch');
  check('student update', (await req('PUT', `/api/admin/students/${ashaId}`, { token: admin, body: { phone: '9000000001', payment_window: 'yearly' } })).json.student.payment_window === 'yearly');
  const batches = await req('GET', '/api/admin/batches', { token: admin });
  check('batches list', batches.status === 200 && batches.json[0].active_students === 1, JSON.stringify(batches.json));
  const batchId = batches.json[0].batch_id;
  const nb = await req('POST', '/api/admin/batches', { token: admin, body: { batch_name: 'Morning B', level_id: 1, teacher_id: batches.json[0].teacher_id, schedule: 'Tue/Thu', time: '7 AM', max_students: '10' } });
  check('batch create', nb.status === 201, JSON.stringify(nb.json));
  check('batch over capacity check', (await req('POST', '/api/admin/batches', { token: admin, body: { batch_name: 'Huge', level_id: 1, teacher_id: 1, schedule: 'x', time: 'y', max_students: 50 } })).status === 400);
  check('move student to new batch', (await req('PUT', `/api/admin/students/${ashaId}`, { token: admin, body: { batch_id: nb.json.batch.batch_id } })).status === 200);
  check('move back', (await req('PUT', `/api/admin/students/${ashaId}`, { token: admin, body: { batch_id: batchId } })).status === 200);
  check('delete empty batch', (await req('DELETE', `/api/admin/batches/${nb.json.batch.batch_id}`, { token: admin })).status === 200);

  // attendance (teacher ownership)
  const today = new Date().toISOString().slice(0, 10);
  const mark = await req('POST', '/api/teachers/attendance', { token: teacherNew, body: { batch_id: batchId, attendance_date: today, attendance_records: [{ student_id: ashaId, status: 'absent' }] } });
  check('teacher marks attendance', mark.status === 201, JSON.stringify(mark.json));
  check('re-mark upserts', (await req('POST', '/api/teachers/attendance', { token: teacherNew, body: { batch_id: batchId, attendance_date: today, records: [{ student_id: ashaId, status: 'absent', notes: 'sick' }] } })).status === 201);
  check('cannot mark unenrolled', (await req('POST', '/api/teachers/attendance', { token: teacherNew, body: { batch_id: batchId, attendance_date: today, records: [{ student_id: 9999, status: 'present' }] } })).status === 400);
  const ba = await req('GET', `/api/teachers/batches/${batchId}/attendance?date=${today}`, { token: teacherNew });
  check('batch attendance read', ba.status === 200 && ba.json[0].status === 'absent');
  check('student attendance', (await req('GET', '/api/students/attendance', { token: student })).json.overall.absent === 1);
  check('admin attendance summary', (await req('GET', '/api/admin/attendance/summary', { token: admin })).status === 200);
  check('delete batch with history blocked', (await req('DELETE', `/api/admin/batches/${batchId}`, { token: admin })).status === 400);

  // reviews
  const rv = { student_id: ashaId, review_month: 11, review_year: 2026, technique_rating: 4, rhythm_rating: '5', creativity_rating: 4, discipline_rating: 5, review_text: 'Great' };
  const r1 = await req('POST', '/api/teachers/reviews', { token: teacherNew, body: rv });
  check('review create', r1.status === 201 && Number(r1.json.overall_rating) === 4.5, JSON.stringify(r1.json));
  check('duplicate review 409', (await req('POST', '/api/teachers/reviews', { token: teacherNew, body: rv })).status === 409);
  check('rating out of range 400', (await req('POST', '/api/teachers/reviews', { token: teacherNew, body: { ...rv, review_month: 10, technique_rating: 9 } })).status === 400);
  const sr = await req('GET', '/api/students/reviews', { token: student });
  check('student sees review', sr.json.length === 1);
  check('mark viewed', (await req('PUT', `/api/students/reviews/${sr.json[0].review_id}/viewed`, { token: student })).json.is_viewed_by_student === true);
  check('other student cannot mark', (await req('PUT', `/api/students/reviews/${sr.json[0].review_id}/viewed`, { token: sid2 })).status === 404);

  // makeup classes
  const missed = await req('GET', '/api/students/missed-classes', { token: student });
  check('missed classes', missed.json.length === 1 && missed.json[0].can_request_makeup === true, JSON.stringify(missed.json));
  const mreq = await req('POST', '/api/students/makeup-requests', { token: student, body: { original_attendance_id: missed.json[0].attendance_id, makeup_batch_id: batchId, makeup_class_date: today } });
  check('makeup request', mreq.status === 201, JSON.stringify(mreq.json));
  check('makeup IDOR blocked', (await req('POST', '/api/students/makeup-requests', { token: sid2, body: { attendance_id: missed.json[0].attendance_id, makeup_batch_id: batchId, makeup_class_date: today } })).status === 400);
  check('teacher approves makeup', (await req('PUT', `/api/teachers/makeup-requests/${mreq.json.booking_id}`, { token: teacherNew, body: { status: 'approved' } })).json.status === 'approved');

  // fees
  const fee = await req('POST', '/api/admin/fees/record', { token: admin, body: { student_id: ashaId, amount: undefined, amount_paid: '1000', payment_method: 'bank_transfer', transaction_reference: 'TX1', status: 'completed', notes: 'Fee for 2026-11', month: '2026-11' } });
  check('record fee 201', fee.status === 201 && fee.json.payment.payment_method === 'net_banking' && fee.json.payment.payment_month === 11, JSON.stringify(fee.json));
  check('fees filter paid', (await req('GET', '/api/admin/fees?status=paid', { token: admin })).json.length === 1);
  check('fees filter overdue', (await req('GET', '/api/admin/fees?status=overdue', { token: admin })).status === 200);
  check('student history shows payment', (await req('GET', '/api/students/fees/history', { token: student })).json.length === 1);
  const dash = await req('GET', '/api/students/dashboard', { token: student });
  check('dashboard fee paid + score', dash.json.feeStatus === 'paid' && dash.json.performance_score !== 85, JSON.stringify(dash.json).slice(0, 300));
  check('delete student with payments blocked', (await req('DELETE', `/api/admin/students/${ashaId}`, { token: admin })).status === 409);

  // status changes & analytics
  const st = await req('PUT', `/api/admin/students/${ashaId}/status`, { token: admin, body: { status: 'inactive' } });
  check('status toggle inactive', st.status === 200 && st.json.student.status === 'inactive', JSON.stringify(st.json));
  check('inactive student loses access', (await req('GET', '/api/students/dashboard', { token: student })).status === 401);
  await req('PUT', `/api/admin/students/${ashaId}/status`, { token: admin, body: { status: 'active' } });
  check('reactivated student logs in', !!(await tokenOf('student@test.com')));
  const sc = await req('GET', '/api/admin/status-changes', { token: admin });
  check('status changes logged', sc.status === 200 && sc.json.some((r) => r.change_type === 'discontinuation') && sc.json.some((r) => r.change_type === 'rejoining'));
  for (const a of ['best-teachers', 'best-students', 'enrollment-trends', 'discontinuation-reasons']) {
    const r = await req('GET', `/api/admin/analytics/${a}`, { token: admin });
    check(`analytics ${a}`, r.status === 200 && Array.isArray(r.json), JSON.stringify(r.json).slice(0, 150));
  }
  check('admin dashboard', (await req('GET', '/api/admin/dashboard', { token: admin })).json.monthly_revenue === 1000);

  // transfers
  const avail = await req('GET', '/api/teachers/batch-transfers/available-teachers', { token: teacherNew });
  check('available teachers', avail.status === 200);
  check('cannot transfer to self/unknown', (await req('POST', '/api/teachers/batch-transfers', { token: teacherNew, body: { batch_id: batchId, substitute_teacher_id: 9999, transfer_date: today } })).status === 400);
  check('transfers list', (await req('GET', '/api/teachers/batch-transfers', { token: teacherNew })).status === 200);

  // ── rate limiting on login (run last)
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const r = await login('ratelimit@test.com', 'Wrong-pass1');
    if (r.status === 429) { limited = true; break; }
  }
  check('login rate limited', limited);

  console.log(`\n${pass} passed, ${fail} failed`);
  results.forEach((r) => console.log(r));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
