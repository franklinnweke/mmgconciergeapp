import { STAFF_ROLE_KEYS, type StaffRoleKey } from '@mmg/contracts';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

initializeApp();

const auth = getAuth();
const firestore = getFirestore();

async function main() {
  const args = process.argv.slice(2);
  const isConfirmed = args.includes('--confirm');
  const nonFlagArgs = args.filter((arg) => !arg.startsWith('--'));

  const [identifier, roleInput, action = 'set'] = nonFlagArgs;

  if (!identifier || !roleInput) {
    console.error('Usage: npx tsx scripts/set-admin-claims.ts <email-or-uid> <role> [set|remove] [--confirm]');
    console.error(`Valid roles: ${STAFF_ROLE_KEYS.join(', ')}`);
    process.exit(1);
  }

  const role = roleInput as StaffRoleKey;
  if (!STAFF_ROLE_KEYS.includes(role)) {
    console.error(`Error: Invalid role "${roleInput}".`);
    console.error(`Valid staff roles are: ${STAFF_ROLE_KEYS.join(', ')}`);
    process.exit(1);
  }

  if (action !== 'set' && action !== 'remove') {
    console.error(`Error: Invalid action "${action}". Must be "set" or "remove".`);
    process.exit(1);
  }

  let userRecord;
  try {
    if (identifier.includes('@')) {
      userRecord = await auth.getUserByEmail(identifier);
    } else {
      userRecord = await auth.getUser(identifier);
    }
  } catch (error) {
    console.error(`User not found for identifier "${identifier}":`, error);
    process.exit(1);
  }

  const currentClaims = (userRecord.customClaims || {}) as Record<string, unknown>;
  const newClaims = { ...currentClaims };

  if (action === 'remove') {
    delete newClaims[role];
  } else {
    newClaims[role] = true;
  }

  console.log('--- Admin Claims Operation Plan ---');
  console.log(`Target User: ${userRecord.uid} (${userRecord.email})`);
  console.log(`Action:      ${action.toUpperCase()}`);
  console.log(`Role:        ${role}`);
  console.log('Current Claims:', currentClaims);
  console.log('Proposed Claims:', newClaims);
  console.log('-----------------------------------');

  if (!isConfirmed) {
    console.warn('\n⚠️  DRY RUN: No changes were applied.');
    console.warn('To apply these changes and write to adminAuditLogs, re-run with --confirm:\n');
    console.warn(`npx tsx scripts/set-admin-claims.ts ${identifier} ${role} ${action} --confirm\n`);
    process.exit(0);
  }

  // 1. Update custom claims
  await auth.setCustomUserClaims(userRecord.uid, newClaims);

  // 2. Revoke refresh tokens to force active sessions to re-authenticate with new claims
  await auth.revokeRefreshTokens(userRecord.uid);

  // 3. Write immutable audit log entry
  const logId = `claim-change-${userRecord.uid}-${Date.now()}`;
  await firestore.collection('adminAuditLogs').doc(logId).set({
    actorId: 'cli:set-admin-claims',
    actorType: 'system',
    target: `users/${userRecord.uid}`,
    targetType: 'userAccount',
    action: action === 'remove' ? 'staff.claim_revoked' : 'staff.claim_granted',
    role,
    previousClaims: currentClaims,
    newClaims,
    reason: `CLI command updated role ${role} to ${action === 'set' ? 'true' : 'removed'}`,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log('\n✅ Successfully updated custom user claims!');
  console.log('✅ Revoked previous user refresh tokens.');
  console.log(`✅ Recorded audit log entry at adminAuditLogs/${logId}`);
  console.log('Final Claims:', newClaims);
}

main().catch((err) => {
  console.error('Failed to execute set-admin-claims:', err);
  process.exit(1);
});
