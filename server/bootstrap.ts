/**
 * Bootstrap Script
 * 
 * This script ensures basic infrastructure exists for the app to function.
 * It does NOT create any users - the first user to register becomes Super Admin.
 * 
 * Creates:
 * - Default workspace (for demo/legacy compatibility)
 * - Default teams
 */

import { db } from "./db";
import { workspaces, teams } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_WORKSPACE_ID = "demo-workspace-id";

const DEFAULT_TEAMS = [
  { id: "engineering-team-id", name: "Engineering" },
  { id: "design-team-id", name: "Design" },
  { id: "marketing-team-id", name: "Marketing" },
];

export async function bootstrapAdminUser(): Promise<void> {
  try {
    console.log("[bootstrap] Checking infrastructure...");

    // Ensure default workspace exists (for demo/legacy compatibility)
    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, DEFAULT_WORKSPACE_ID)).limit(1);
    
    if (existingWorkspace.length === 0) {
      console.log("[bootstrap] Creating default workspace...");
      await db.insert(workspaces).values({
        id: DEFAULT_WORKSPACE_ID,
        name: "Default Workspace",
        createdBy: null,
      });
    }

    // Ensure default teams exist
    for (const team of DEFAULT_TEAMS) {
      const existingTeam = await db.select().from(teams).where(eq(teams.id, team.id)).limit(1);
      
      if (existingTeam.length === 0) {
        console.log(`[bootstrap] Creating team: ${team.name}`);
        await db.insert(teams).values({
          id: team.id,
          workspaceId: DEFAULT_WORKSPACE_ID,
          name: team.name,
        });
      }
    }

    console.log("[bootstrap] Bootstrap complete");
    console.log("[bootstrap] First user to register becomes Super Admin");
  } catch (error) {
    console.error("[bootstrap] Error during bootstrap:", error);
  }
}
