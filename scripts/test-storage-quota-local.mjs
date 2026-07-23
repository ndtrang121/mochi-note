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

function noteRow(userId, id, plainText, timestamp) {
  return {
    archived_at: null,
    client_updated_at: timestamp,
    color: 'yellow',
    content: { type: 'doc', content: [{ type: 'paragraph', text: plainText }] },
    created_at: timestamp,
    deleted_at: null,
    device_id: 'quota-test-device',
    favorite: false,
    folder_id: null,
    id,
    pattern: 'none',
    pinned: false,
    plain_text: plainText,
    source: { title: 'Unicode source á', url: 'https://example.test' },
    tags: ['quota', 'đồng bộ'],
    title: `Quota ${id}`,
    trashed_at: null,
    updated_at: timestamp,
    user_id: userId,
  };
}

async function createTestUser(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  assert(data.user && data.session, `Expected immediate local session for ${email}`);
  return data.user;
}

async function usage(client) {
  const { data, error } = await client.rpc('get_cloud_storage_usage');
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function upsertNote(client, row) {
  return client.from('notes').upsert(row, { onConflict: 'user_id,id' });
}

const status = readLocalStatus();
const apiUrl = new globalThis.URL(status.API_URL);
assert(
  apiUrl.hostname === '127.0.0.1' || apiUrl.hostname === 'localhost',
  'Refusing to run destructive quota verification against a non-local Supabase URL.',
);
assert(status.PUBLISHABLE_KEY, 'Missing local publishable key.');
assert(status.SECRET_KEY, 'Missing local secret key required for quota verification.');

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const userAClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
const userBClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
const admin = createClient(status.API_URL, status.SECRET_KEY, clientOptions);
const runId = Date.now();
const password = 'MochiNote-local-test-123!';
const testUsers = [];

try {
  const freePlan = await admin
    .from('subscription_plans')
    .select('storage_limit_bytes')
    .eq('code', 'free')
    .single();
  if (freePlan.error) throw freePlan.error;
  assert(Number(freePlan.data.storage_limit_bytes) === 5_242_880, 'Free plan must be exactly 5 MiB.');

  const userA = await createTestUser(userAClient, `mochi-quota-${runId}-a@example.com`, password);
  const userB = await createTestUser(userBClient, `mochi-quota-${runId}-b@example.com`, password);
  testUsers.push(userA.id, userB.id);

  const timestamp = new Date(Date.now() + 1_000).toISOString();
  let result = await upsertNote(userAClient, noteRow(userA.id, 'note-a', 'Xin chào quota á'.repeat(6), timestamp));
  if (result.error) throw result.error;

  const initialUsage = await usage(userAClient);
  assert(initialUsage.planCode === 'free', 'Usage RPC should report the Free plan.');
  assert(Number(initialUsage.limitBytes) === 5_242_880, 'Usage RPC should expose the Free limit.');
  assert(Number(initialUsage.usedBytes) > Buffer.byteLength('Xin chào quota á', 'utf8'), 'Usage should count UTF-8 payload bytes.');

  const userBUsageRows = await userBClient.from('user_storage_usage').select('user_id,used_bytes');
  if (userBUsageRows.error) throw userBUsageRows.error;
  assert(userBUsageRows.data.every((row) => row.user_id === userB.id), 'Users must not read another user storage usage row.');

  const spoofUsageUpdate = await userAClient
    .from('user_storage_usage')
    .update({ used_bytes: 0 })
    .eq('user_id', userA.id);
  assert(spoofUsageUpdate.error?.code === '42501', 'Client must not update storage usage directly.');

  const highLimit = 20_000_000;
  result = await admin
    .from('subscription_plans')
    .update({ storage_limit_bytes: highLimit })
    .eq('code', 'free');
  if (result.error) throw result.error;

  const beforeCandidate = await usage(userAClient);
  result = await upsertNote(userAClient, noteRow(userA.id, 'candidate-a', 'x'.repeat(512), timestamp));
  if (result.error) throw result.error;
  const afterCandidate = await usage(userAClient);
  const candidateDelta = Number(afterCandidate.usedBytes) - Number(beforeCandidate.usedBytes);
  assert(candidateDelta > 0, 'Candidate insert should increase usage.');

  result = await userAClient.from('notes').delete().eq('user_id', userA.id).eq('id', 'candidate-a');
  if (result.error) throw result.error;
  const afterDelete = await usage(userAClient);
  assert(Number(afterDelete.usedBytes) === Number(beforeCandidate.usedBytes), 'Physical delete should reduce usage.');

  result = await admin
    .from('subscription_plans')
    .update({ storage_limit_bytes: Number(afterDelete.usedBytes) })
    .eq('code', 'free');
  if (result.error) throw result.error;

  const quotaError = await upsertNote(userAClient, noteRow(userA.id, 'too-large', 'z'.repeat(128), timestamp));
  assert(
    quotaError.error && `${quotaError.error.message} ${quotaError.error.details}`.includes('STORAGE_QUOTA_EXCEEDED'),
    'Increasing usage at the exact limit should be blocked with STORAGE_QUOTA_EXCEEDED.',
  );

  result = await upsertNote(userAClient, { ...noteRow(userA.id, 'note-a', '', timestamp), deleted_at: timestamp });
  if (result.error) throw result.error;
  const afterTombstone = await usage(userAClient);
  assert(Number(afterTombstone.usedBytes) < Number(afterDelete.usedBytes), 'Tombstone delete should reduce usage even while quota is full.');

  result = await admin
    .from('subscription_plans')
    .update({ storage_limit_bytes: highLimit })
    .eq('code', 'free');
  if (result.error) throw result.error;
  const beforeRace = await usage(userAClient);
  result = await upsertNote(userAClient, noteRow(userA.id, 'race-probe', 'r'.repeat(512), timestamp));
  if (result.error) throw result.error;
  const afterRaceProbe = await usage(userAClient);
  const raceDelta = Number(afterRaceProbe.usedBytes) - Number(beforeRace.usedBytes);
  result = await userAClient.from('notes').delete().eq('user_id', userA.id).eq('id', 'race-probe');
  if (result.error) throw result.error;

  result = await admin
    .from('subscription_plans')
    .update({ storage_limit_bytes: Number(beforeRace.usedBytes) + raceDelta })
    .eq('code', 'free');
  if (result.error) throw result.error;

  const raceRows = [
    noteRow(userA.id, 'race-a', 'r'.repeat(512), timestamp),
    noteRow(userA.id, 'race-b', 'r'.repeat(512), timestamp),
  ];
  const raceResults = await Promise.all(raceRows.map((row) => upsertNote(userAClient, row)));
  assert(raceResults.filter((item) => !item.error).length === 1, 'Concurrent writes must not both cross the quota boundary.');

  globalThis.console.log(JSON.stringify({
    boundary: 'passed',
    concurrency: 'passed',
    deleteReduction: 'passed',
    directClientMutationDenied: 'passed',
    freePlanLimit: 'passed',
    rlsIsolation: 'passed',
    unicodeUtf8: 'passed',
  }));
} finally {
  await Promise.allSettled([
    admin.from('subscription_plans').update({ storage_limit_bytes: 5_242_880 }).eq('code', 'free'),
    userAClient.auth.signOut(),
    userBClient.auth.signOut(),
  ]);
  await Promise.allSettled(testUsers.map((userId) => admin.auth.admin.deleteUser(userId)));
}
