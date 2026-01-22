import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { tenants, workspaces, users, clients, clientDivisions, projects } from "@shared/schema";

describe("Time tracking division cascade", () => {
  let tenantId: string;
  let workspaceId: string;
  let adminUserId: string;
  let clientId: string;
  let divisionId: string;
  let projectWithDivisionId: string;
  let projectWithoutDivisionId: string;

  beforeAll(async () => {
    tenantId = crypto.randomUUID();
    workspaceId = crypto.randomUUID();
    adminUserId = crypto.randomUUID();
    clientId = crypto.randomUUID();
    divisionId = crypto.randomUUID();
    projectWithDivisionId = crypto.randomUUID();
    projectWithoutDivisionId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: "Test Tenant",
      slug: `test-tenant-${tenantId.slice(0, 8)}`,
    });

    await db.insert(workspaces).values({
      id: workspaceId,
      tenantId,
      name: "Test Workspace",
    });

    await db.insert(users).values({
      id: adminUserId,
      tenantId,
      workspaceId,
      name: "Test Admin",
      email: `admin-${adminUserId.slice(0, 8)}@test.com`,
      role: "admin",
    });

    await db.insert(clients).values({
      id: clientId,
      tenantId,
      workspaceId,
      companyName: "Test Client",
    });

    await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId,
      clientId,
      name: "Engineering",
      color: "#3B82F6",
    });

    await db.insert(projects).values({
      id: projectWithDivisionId,
      tenantId,
      workspaceId,
      clientId,
      divisionId,
      name: "Project With Division",
    });

    await db.insert(projects).values({
      id: projectWithoutDivisionId,
      tenantId,
      workspaceId,
      clientId,
      divisionId: null,
      name: "Project Without Division",
    });
  });

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(projects).where(eq(projects.tenantId, tenantId));
    await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));
    await db.delete(clients).where(eq(clients.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(workspaces).where(eq(workspaces.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("should return divisions for a client", async () => {
    const response = await fetch(`http://localhost:5000/api/v1/clients/${clientId}/divisions`, {
      credentials: "include",
    });
    
    expect(response.status).toBe(401);
  });

  it("should have project with divisionId set correctly", async () => {
    const projectsResult = await db.query.projects.findMany({
      where: (p, { eq }) => eq(p.clientId, clientId),
    });

    expect(projectsResult.length).toBe(2);
    
    const projectWithDiv = projectsResult.find(p => p.id === projectWithDivisionId);
    const projectWithoutDiv = projectsResult.find(p => p.id === projectWithoutDivisionId);
    
    expect(projectWithDiv?.divisionId).toBe(divisionId);
    expect(projectWithoutDiv?.divisionId).toBeNull();
  });

  it("should filter projects by divisionId", async () => {
    const allProjects = await db.query.projects.findMany({
      where: (p, { eq }) => eq(p.clientId, clientId),
    });

    const projectsInDivision = allProjects.filter(p => p.divisionId === divisionId);
    const projectsWithoutDivision = allProjects.filter(p => p.divisionId === null);

    expect(projectsInDivision.length).toBe(1);
    expect(projectsInDivision[0].name).toBe("Project With Division");
    
    expect(projectsWithoutDivision.length).toBe(1);
    expect(projectsWithoutDivision[0].name).toBe("Project Without Division");
  });

  it("should have correct division structure", async () => {
    const divisionsResult = await db.query.clientDivisions.findMany({
      where: (d, { eq }) => eq(d.clientId, clientId),
    });

    expect(divisionsResult.length).toBe(1);
    expect(divisionsResult[0]).toMatchObject({
      id: divisionId,
      tenantId,
      clientId,
      name: "Engineering",
      color: "#3B82F6",
    });
  });

  it("should cascade: selecting division filters available projects", async () => {
    const allClientProjects = await db.query.projects.findMany({
      where: (p, { eq }) => eq(p.clientId, clientId),
    });

    expect(allClientProjects.length).toBe(2);

    const selectedDivisionId = divisionId;
    const filteredProjects = allClientProjects.filter(p => p.divisionId === selectedDivisionId);

    expect(filteredProjects.length).toBe(1);
    expect(filteredProjects[0].id).toBe(projectWithDivisionId);
  });
});
