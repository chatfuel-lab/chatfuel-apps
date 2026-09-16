/**
 * The two levels, as the product defines them: a Manager is an admin, a
 * Specialist is a member linked to exactly one calendar specialist. The
 * owner is above both and never changes here.
 */
export type StaffLevel = "manager" | "specialist";
export type Role = "owner" | "admin" | "member";

export interface MemberRow {
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  bots: string[] | null;
  specialist_id: string | null;
  display_name: string | null;
}

export interface InviteRow {
  id: string;
  role: "admin" | "member";
  email: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  bot_ids: string[] | null;
  specialist_id: string | null;
  display_name: string | null;
}

export interface Specialist {
  id: string;
  name: string;
}

export const levelOf = (role: Role): StaffLevel | "owner" => (role === "owner" ? "owner" : role === "admin" ? "manager" : "specialist");

export const roleOfLevel = (level: StaffLevel): "admin" | "member" => (level === "manager" ? "admin" : "member");

/** What `cf_change_member_role` receives; a specialist without a calendar is refused by the migration too. */
export function changeLevelArgs(tenantId: string, userId: string, level: StaffLevel, specialistId: string | null) {
  return { p_tenant_id: tenantId, p_user_id: userId, p_role: roleOfLevel(level), p_specialist_id: level === "specialist" ? specialistId : null };
}

export function inviteArgs(tenantId: string, email: string, level: StaffLevel, specialistId: string | null, displayName: string | null) {
  return {
    p_tenant_id: tenantId,
    p_role: roleOfLevel(level),
    p_email: email.trim().toLowerCase(),
    p_specialist_id: level === "specialist" ? specialistId : null,
    p_display_name: displayName?.trim() || null,
  };
}

/** Calendars nobody holds yet: a specialist is one login per calendar. */
export function freeSpecialists(specialists: readonly Specialist[], members: readonly MemberRow[], invites: readonly InviteRow[], keep: string | null = null): Specialist[] {
  const taken = new Set<string>();
  members.forEach((m) => { if (m.specialist_id && m.specialist_id !== keep) taken.add(m.specialist_id); });
  invites.forEach((i) => { if (i.status === "pending" && i.specialist_id && i.specialist_id !== keep) taken.add(i.specialist_id); });
  return specialists.filter((s) => !taken.has(s.id));
}

export const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
