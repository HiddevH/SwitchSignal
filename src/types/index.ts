export interface Member {
  phone: string;
  name: string;
  isAdmin: boolean;
  signalRegistered?: boolean;
  signalCheckedAt?: string;
}

export interface GroupInfo {
  waGroupId: string;
  name: string;
  description: string;
  memberCount: number;
  members: Member[];
  avatarPath: string | null;
  migrate: boolean;
  signalGroupId: string | null;
  signalInviteLink: string | null;
  status: 'pending' | 'signal_created' | 'notified' | 'completed';
  readiness?: GroupReadiness;
}

export type ReadinessStatus = 'ready' | 'almost' | 'not_ready';

export interface GroupReadiness {
  total: number;
  onSignal: number;
  missing: Array<{ phone: string; name: string }>;
  percentage: number;
  status: ReadinessStatus;
  checkedAt: string;
}

export interface MigrationState {
  scannedAt: string;
  groups: GroupInfo[];
}

export interface GroupInvite {
  name: string;
  inviteLink: string;
}

export type Language = 'nl' | 'en';

export type NotifyStrategy = 'personal' | 'group' | 'both';

export interface SignalGroupCreateResponse {
  id: string;
  name: string;
  inviteLink?: string;
}
