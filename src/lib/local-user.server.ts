import type { Sql } from "@/lib/db";
import { LOCAL_USER_EMAIL, LOCAL_USER_ID, LOCAL_USER_NAME } from "@/lib/local-user";

/** Make sure the single local owner row exists so work rows can reference it. */
export async function ensureLocalUser(sql: Sql, userId = LOCAL_USER_ID): Promise<void> {
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${LOCAL_USER_NAME}, ${LOCAL_USER_EMAIL}, true, now(), now())
    on conflict (id) do nothing
  `;
}
