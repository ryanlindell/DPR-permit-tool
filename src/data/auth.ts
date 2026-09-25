import type { Session, User } from "@supabase/supabase-js";
import { getUsernameEmail, requireSupabase } from "./supabaseClient";

/** Load the signed-in user through the shared data layer. */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

/** Subscribe to session changes; callers receive only the user value they need. */
export function subscribeToAuthChanges(listener: (user: User | null) => void): () => void {
  const { data } = requireSupabase().auth.onAuthStateChange((_event, session: Session | null) => {
    listener(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithUsername(username: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: getUsernameEmail(username),
    password,
  });
  if (error) throw error;
}

export async function createAccountWithInvite(username: string, password: string, inviteCode: string): Promise<void> {
  const { error } = await requireSupabase().functions.invoke("signup-with-invite", {
    body: { username, password, inviteCode },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
