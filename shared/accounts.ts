export type AccountUser = { id: string; name: string; email: string };
export type HouseholdRole = "owner" | "member";
export type Household = { id: string; name: string; role: HouseholdRole };
export type HouseholdMember = AccountUser & { role: HouseholdRole };
export type SessionView = {
  user: AccountUser | null;
  households: Household[];
  activeHouseholdId: string | null;
  csrfToken: string;
  expiresAt: number;
};
export type InvitationView = { id: string; email: string; expiresAt: number };
