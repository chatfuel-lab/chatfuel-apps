import { describe, expect, it } from "vitest";
import { changeLevelArgs, freeSpecialists, inviteArgs, levelOf, type InviteRow, type MemberRow } from "./model";

const member = (userId: string, role: MemberRow["role"], specialistId: string | null = null): MemberRow =>
  ({ user_id: userId, role, email: `${userId}@x.cl`, full_name: null, avatar_url: null, joined_at: "2026-09-15", bots: [], specialist_id: specialistId, display_name: null });
const invite = (id: string, specialistId: string | null, status: InviteRow["status"] = "pending"): InviteRow =>
  ({ id, role: "member", email: null, created_by: null, created_by_name: null, created_at: "2026-09-15", expires_at: "2026-09-22", status, bot_ids: [], specialist_id: specialistId, display_name: null });

describe("levels", () => {
  it("map the auth roles the migration keeps: admin is a manager, member is a specialist", () => {
    expect(levelOf("owner")).toBe("owner");
    expect(levelOf("admin")).toBe("manager");
    expect(levelOf("member")).toBe("specialist");
  });
  it("write the role and the calendar together, and never a calendar for a manager", () => {
    expect(changeLevelArgs("t", "u", "specialist", "spec-1")).toEqual({ p_tenant_id: "t", p_user_id: "u", p_role: "member", p_specialist_id: "spec-1" });
    expect(changeLevelArgs("t", "u", "manager", "spec-1")).toEqual({ p_tenant_id: "t", p_user_id: "u", p_role: "admin", p_specialist_id: null });
    expect(inviteArgs("t", " Ana@Salon.CL ", "specialist", "spec-2", " Ana ")).toEqual({ p_tenant_id: "t", p_role: "member", p_email: "ana@salon.cl", p_specialist_id: "spec-2", p_display_name: "Ana" });
  });
  it("offer only the calendars nobody holds, keeping the one being edited", () => {
    const specialists = [{ id: "s1", name: "Ana" }, { id: "s2", name: "Bea" }, { id: "s3", name: "Cami" }];
    const members = [member("owner", "owner"), member("u2", "member", "s1")];
    const invites = [invite("i1", "s2"), invite("i2", "s3", "revoked")];
    expect(freeSpecialists(specialists, members, invites).map((s) => s.id)).toEqual(["s3"]);
    expect(freeSpecialists(specialists, members, invites, "s1").map((s) => s.id)).toEqual(["s1", "s3"]);
  });
});
