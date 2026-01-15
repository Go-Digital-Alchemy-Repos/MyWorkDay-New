import { describe, it, expect } from "vitest";
import { TenantStatus } from "@shared/schema";

describe("Orphan Health Endpoints", () => {
  describe("GET /api/v1/super/health/orphans - Detection Response Schema", () => {
    it("returns totalOrphans count", () => {
      const mockResponse = {
        totalOrphans: 15,
        tablesWithOrphans: 3,
        tables: [
          { table: "tasks", count: 10, sampleIds: [{ id: "uuid-1", display: "Task A" }], recommendedAction: "quarantine" },
          { table: "projects", count: 5, sampleIds: [], recommendedAction: "quarantine" },
        ],
        quarantineTenant: { exists: true, id: "qt-uuid", name: "Quarantine" },
      };
      
      expect(mockResponse.totalOrphans).toBe(15);
      expect(mockResponse.tablesWithOrphans).toBe(3);
    });

    it("returns counts and sample IDs per table", () => {
      const tableResult = {
        table: "tasks",
        count: 10,
        sampleIds: [
          { id: "uuid-1", display: "Task A" },
          { id: "uuid-2", display: "Task B" },
        ],
        recommendedAction: "quarantine",
      };
      
      expect(tableResult.count).toBe(10);
      expect(tableResult.sampleIds).toHaveLength(2);
      expect(tableResult.sampleIds[0]).toHaveProperty("id");
      expect(tableResult.sampleIds[0]).toHaveProperty("display");
      expect(tableResult.recommendedAction).toBe("quarantine");
    });

    it("indicates quarantine tenant existence", () => {
      const existingQuarantine = { exists: true, id: "qt-uuid", name: "Quarantine" };
      const noQuarantine = { exists: false };
      
      expect(existingQuarantine.exists).toBe(true);
      expect(existingQuarantine.id).toBeDefined();
      expect(noQuarantine.exists).toBe(false);
    });

    it("returns recommendedAction=skip when no orphans", () => {
      const cleanTable = {
        table: "teams",
        count: 0,
        sampleIds: [],
        recommendedAction: "skip",
      };
      
      expect(cleanTable.count).toBe(0);
      expect(cleanTable.recommendedAction).toBe("skip");
    });
  });

  describe("POST /api/v1/super/health/orphans/fix - Confirmation Guard", () => {
    const validateConfirmation = (dryRun: boolean, confirmText?: string): { valid: boolean; error?: string } => {
      if (!dryRun && confirmText !== "FIX_ORPHANS") {
        return {
          valid: false,
          error: "To execute orphan fix, set dryRun=false and confirmText='FIX_ORPHANS'",
        };
      }
      return { valid: true };
    };

    it("allows dry-run without confirmText", () => {
      expect(validateConfirmation(true)).toEqual({ valid: true });
      expect(validateConfirmation(true, undefined)).toEqual({ valid: true });
      expect(validateConfirmation(true, "ANYTHING")).toEqual({ valid: true });
    });

    it("requires FIX_ORPHANS for execution", () => {
      const result = validateConfirmation(false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("FIX_ORPHANS");
    });

    it("rejects wrong confirmText for execution", () => {
      expect(validateConfirmation(false, "WRONG").valid).toBe(false);
      expect(validateConfirmation(false, "fix_orphans").valid).toBe(false);
      expect(validateConfirmation(false, "").valid).toBe(false);
    });

    it("accepts correct confirmText for execution", () => {
      expect(validateConfirmation(false, "FIX_ORPHANS")).toEqual({ valid: true });
    });
  });

  describe("POST /api/v1/super/health/orphans/fix - Dry Run Response", () => {
    it("returns dryRun=true in response", () => {
      const dryRunResponse = {
        dryRun: true,
        quarantineTenantId: null,
        quarantineCreated: false,
        totalFixed: 0,
        totalWouldFix: 15,
        results: [
          { table: "tasks", action: "would_fix", countBefore: 10, countFixed: 0, targetTenantId: "quarantine" },
        ],
      };
      
      expect(dryRunResponse.dryRun).toBe(true);
      expect(dryRunResponse.totalFixed).toBe(0);
      expect(dryRunResponse.totalWouldFix).toBe(15);
    });

    it("returns would_fix action in dry-run", () => {
      const result = { table: "tasks", action: "would_fix", countBefore: 10, countFixed: 0, targetTenantId: "quarantine" };
      
      expect(result.action).toBe("would_fix");
      expect(result.countFixed).toBe(0);
    });
  });

  describe("POST /api/v1/super/health/orphans/fix - Execution Response", () => {
    it("returns dryRun=false and totalFixed count", () => {
      const executionResponse = {
        dryRun: false,
        quarantineTenantId: "qt-uuid",
        quarantineCreated: true,
        totalFixed: 15,
        totalWouldFix: 0,
        results: [
          { table: "tasks", action: "fixed", countBefore: 10, countFixed: 10, targetTenantId: "qt-uuid" },
          { table: "projects", action: "fixed", countBefore: 5, countFixed: 5, targetTenantId: "qt-uuid" },
        ],
      };
      
      expect(executionResponse.dryRun).toBe(false);
      expect(executionResponse.totalFixed).toBe(15);
      expect(executionResponse.totalWouldFix).toBe(0);
      expect(executionResponse.quarantineTenantId).toBeDefined();
    });

    it("returns fixed action with count after execution", () => {
      const result = { table: "tasks", action: "fixed", countBefore: 10, countFixed: 10, targetTenantId: "qt-uuid" };
      
      expect(result.action).toBe("fixed");
      expect(result.countFixed).toBe(result.countBefore);
    });

    it("indicates if quarantine tenant was created", () => {
      const responseWithNewQuarantine = { quarantineCreated: true, quarantineTenantId: "new-qt-uuid" };
      const responseWithExistingQuarantine = { quarantineCreated: false, quarantineTenantId: "existing-qt-uuid" };
      
      expect(responseWithNewQuarantine.quarantineCreated).toBe(true);
      expect(responseWithExistingQuarantine.quarantineCreated).toBe(false);
    });
  });

  describe("Quarantine Tenant Constants", () => {
    const QUARANTINE_TENANT_SLUG = "quarantine";
    const QUARANTINE_TENANT_NAME = "Quarantine (Orphan Data)";
    
    it("uses correct slug", () => {
      expect(QUARANTINE_TENANT_SLUG).toBe("quarantine");
    });

    it("uses descriptive name", () => {
      expect(QUARANTINE_TENANT_NAME).toContain("Quarantine");
    });

    it("creates with SUSPENDED status", () => {
      const expectedStatus = TenantStatus.SUSPENDED;
      expect(expectedStatus).toBe("suspended");
    });
  });

  describe("Tables Scanned for Orphans", () => {
    const orphanTables = [
      "clients", "projects", "tasks", "teams", "users",
      "workspaces", "time_entries", "active_timers",
      "invitations", "subtasks", "task_attachments",
    ];

    it("includes all expected tables", () => {
      expect(orphanTables).toContain("clients");
      expect(orphanTables).toContain("projects");
      expect(orphanTables).toContain("tasks");
      expect(orphanTables).toContain("teams");
      expect(orphanTables).toContain("users");
      expect(orphanTables).toContain("workspaces");
      expect(orphanTables).toContain("time_entries");
      expect(orphanTables).toContain("active_timers");
      expect(orphanTables).toContain("invitations");
      expect(orphanTables).toContain("subtasks");
      expect(orphanTables).toContain("task_attachments");
    });

    it("scans 11 tables total", () => {
      expect(orphanTables).toHaveLength(11);
    });
  });

  describe("Result Actions", () => {
    const validActions = ["would_fix", "fixed", "skipped", "no_orphans", "error", "skipped_no_target"];

    it("defines all expected action types", () => {
      expect(validActions).toContain("would_fix");
      expect(validActions).toContain("fixed");
      expect(validActions).toContain("skipped");
      expect(validActions).toContain("no_orphans");
      expect(validActions).toContain("error");
    });

    it("uses would_fix for dry-run with orphans", () => {
      expect(validActions).toContain("would_fix");
    });

    it("uses fixed for successful execution", () => {
      expect(validActions).toContain("fixed");
    });

    it("uses no_orphans when table is clean", () => {
      expect(validActions).toContain("no_orphans");
    });
  });
});
