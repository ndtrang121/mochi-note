import { execFileSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readLocalStatus() {
  const rawStatus = globalThis.process.platform === 'win32'
    ? execFileSync(
        globalThis.process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', 'pnpm exec supabase status --output json'],
        { encoding: 'utf8' },
      )
    : execFileSync(
        'pnpm',
        ['exec', 'supabase', 'status', '--output', 'json'],
        { encoding: 'utf8' },
      );
  const jsonStart = rawStatus.indexOf('{');
  const jsonEnd = rawStatus.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error('Unable to parse Supabase local status. Is the stack running?');
  }
  return JSON.parse(rawStatus.slice(jsonStart, jsonEnd + 1));
}

function createFolder(userId, name, clientUpdatedAt, deviceId, deletedAt = null) {
  return {
    client_updated_at: clientUpdatedAt,
    color: 'sage',
    created_at: clientUpdatedAt,
    deleted_at: deletedAt,
    device_id: deviceId,
    icon: 'folder',
    id: 'shared-folder-id',
    name,
    parent_id: null,
    position: 0,
    updated_at: clientUpdatedAt,
    user_id: userId,
  };
}

async function createTestUser(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  assert(data.user && data.session, `Expected immediate local session for ${email}`);
  return data.user;
}

const status = readLocalStatus();
const apiUrl = new globalThis.URL(status.API_URL);
assert(
  apiUrl.hostname === '127.0.0.1' || apiUrl.hostname === 'localhost',
  'Refusing to run destructive verification against a non-local Supabase URL.',
);
assert(status.PUBLISHABLE_KEY, 'Missing local publishable key.');
assert(status.SECRET_KEY, 'Missing local secret key required for test cleanup.');

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const anonymous = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
const userAClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
const userBClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
const admin = createClient(status.API_URL, status.SECRET_KEY, clientOptions);
const runId = Date.now();
const password = 'MochiNote-local-test-123!';
const testUsers = [];

try {
  const anonymousRead = await anonymous.from('folders').select('id');
  assert(anonymousRead.error?.code === '42501', 'Anonymous reads must be denied.');

  const userA = await createTestUser(
    userAClient,
    `mochi-${runId}-a@example.com`,
    password,
  );
  const userB = await createTestUser(
    userBClient,
    `mochi-${runId}-b@example.com`,
    password,
  );
  testUsers.push(userA.id, userB.id);

  const baseTime = Date.now() + 1_000;
  const timestamp = (offset) => new Date(baseTime + offset).toISOString();

  let result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'A initial', timestamp(1_000), 'device-a'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;
  result = await userBClient
    .from('folders')
    .upsert(createFolder(userB.id, 'B initial', timestamp(1_000), 'device-b'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;

  const userARows = await userAClient.from('folders').select('user_id,id,name');
  if (userARows.error) throw userARows.error;
  assert(userARows.data.length === 1 && userARows.data[0].user_id === userA.id, 'User A isolation failed.');
  const userBRows = await userBClient.from('folders').select('user_id,id,name');
  if (userBRows.error) throw userBRows.error;
  assert(userBRows.data.length === 1 && userBRows.data[0].user_id === userB.id, 'User B isolation failed.');

  const spoof = await userBClient
    .from('folders')
    .upsert(createFolder(userA.id, 'spoofed', timestamp(2_000), 'device-z'), { onConflict: 'user_id,id' });
  assert(spoof.error?.code === '42501', 'Spoofed user_id must be denied.');

  result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'newer', timestamp(3_000), 'device-b'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;
  result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'older-loses', timestamp(2_000), 'device-z'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;
  result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'tie-lower-loses', timestamp(3_000), 'device-a'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;

  let current = await userAClient
    .from('folders')
    .select('name,device_id,deleted_at,sync_version')
    .single();
  if (current.error) throw current.error;
  assert(current.data.name === 'newer' && current.data.device_id === 'device-b', 'LWW tie-break failed.');
  const versionBeforeDelete = Number(current.data.sync_version);

  result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'deleted', timestamp(4_000), 'device-z', timestamp(4_000)), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;
  result = await userAClient
    .from('folders')
    .upsert(createFolder(userA.id, 'resurrect-attempt', timestamp(3_500), 'device-z'), { onConflict: 'user_id,id' });
  if (result.error) throw result.error;

  current = await userAClient.from('folders').select('name,deleted_at,sync_version').single();
  if (current.error) throw current.error;
  assert(current.data.name === 'deleted' && current.data.deleted_at, 'An older write resurrected a tombstone.');
  assert(Number(current.data.sync_version) > versionBeforeDelete, 'sync_version did not advance.');

  for (const table of ['notes', 'tasks', 'reminders', 'app_settings']) {
    const tableAccess = await userAClient.from(table).select('id').limit(1);
    if (tableAccess.error) {
      throw new Error(`${table} is not exposed to authenticated users: ${tableAccess.error.message}`);
    }
  }

  globalThis.console.log(JSON.stringify({
    auth: 'passed',
    dataApiGrants: 'passed',
    lww: 'passed',
    rlsIsolation: 'passed',
    spoofProtection: 'passed',
    syncVersion: 'passed',
    tombstone: 'passed',
  }));
} finally {
  await Promise.allSettled([
    userAClient.auth.signOut(),
    userBClient.auth.signOut(),
  ]);
  // The secret key is local-only and used solely to avoid accumulating test accounts.
  await Promise.allSettled(testUsers.map((userId) => admin.auth.admin.deleteUser(userId)));
}
