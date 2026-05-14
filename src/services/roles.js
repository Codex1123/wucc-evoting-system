const roleAliases = {
  superadmn: 'superadmin',
  super_admin: 'superadmin',
  superadmins: 'superadmin',
  superadmin: 'superadmin',
  admin: 'commissioner',
  commisiner: 'commissioner',
  comissioner: 'commissioner',
  commisioner: 'commissioner',
  commissoner: 'commissioner',
  commissioner: 'commissioner',
  commission: 'commissioner',
  observe: 'observer',
  observer: 'observer',
  voter: 'voter'
};

export const adminRoles = ['superadmin', 'commissioner', 'observer'];
export const electionManagerRoles = ['superadmin', 'commissioner'];

export function normalizeRole(role) {
  const key = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return roleAliases[key] || key;
}

export function isAdminRole(role) {
  return adminRoles.includes(normalizeRole(role));
}

export function isElectionManagerRole(role) {
  return electionManagerRoles.includes(normalizeRole(role));
}

export function permissionsFor(role) {
  const normalized = normalizeRole(role);
  const superAdmin = normalized === 'superadmin';
  const commissioner = normalized === 'commissioner';
  return {
    role: normalized,
    canControlElection: superAdmin || commissioner,
    canEditElectionSettings: superAdmin,
    canFinalizeElection: superAdmin,
    canCreateElectionCycle: superAdmin,
    canResetElection: superAdmin,
    canManageVoters: superAdmin || commissioner,
    canManageCandidates: superAdmin || commissioner,
    canApproveApplications: superAdmin || commissioner,
    canDeleteRecords: superAdmin,
    canViewReceipts: ['superadmin', 'commissioner', 'observer'].includes(normalized),
    readOnly: normalized === 'observer'
  };
}

export function roleLabel(role) {
  return {
    superadmin: 'Super Admin',
    commissioner: 'Commissioner',
    admin: 'Admin',
    observer: 'Observer',
    voter: 'Voter'
  }[normalizeRole(role)] || 'User';
}
