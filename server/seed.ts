import { db } from "./db";
import {
  users,
  workspaces,
  workspaceMembers,
  teams,
  teamMembers,
  projects,
  projectMembers,
  sections,
  tasks,
  taskAssignees,
  subtasks,
  tags,
  taskTags,
} from "@shared/schema";
import { sql } from "drizzle-orm";

const DEMO_USER_ID = "demo-user-id";
const DEMO_WORKSPACE_ID = "demo-workspace-id";

async function seed() {
  console.log("Seeding database...");

  await db.execute(sql`TRUNCATE TABLE activity_log, notifications, comments, task_tags, tags, subtasks, task_assignees, tasks, sections, project_members, projects, team_members, teams, workspace_members, workspaces, users CASCADE`);

  const [owner] = await db.insert(users).values({
    id: DEMO_USER_ID,
    email: "owner@demo.com",
    name: "Demo Owner",
    passwordHash: "$2a$10$somehash",
  }).returning();

  const [member] = await db.insert(users).values({
    id: "member-user-id",
    email: "member@demo.com",
    name: "Team Member",
    passwordHash: "$2a$10$somehash",
  }).returning();

  const [guest] = await db.insert(users).values({
    id: "guest-user-id",
    email: "guest@demo.com",
    name: "Guest User",
    passwordHash: "$2a$10$somehash",
  }).returning();

  const [workspace] = await db.insert(workspaces).values({
    id: DEMO_WORKSPACE_ID,
    name: "DASANA Workspace",
    createdBy: owner.id,
  }).returning();

  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: owner.id, role: "owner", status: "active" },
    { workspaceId: workspace.id, userId: member.id, role: "member", status: "active" },
    { workspaceId: workspace.id, userId: guest.id, role: "guest", status: "active" },
  ]);

  const [engineeringTeam] = await db.insert(teams).values({
    workspaceId: workspace.id,
    name: "Engineering",
  }).returning();

  const [designTeam] = await db.insert(teams).values({
    workspaceId: workspace.id,
    name: "Design",
  }).returning();

  await db.insert(teamMembers).values([
    { teamId: engineeringTeam.id, userId: owner.id },
    { teamId: engineeringTeam.id, userId: member.id },
    { teamId: designTeam.id, userId: owner.id },
  ]);

  const [productLaunch] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: engineeringTeam.id,
    name: "Product Launch",
    description: "Q1 2026 product launch planning and execution",
    visibility: "workspace",
    status: "active",
    color: "#3B82F6",
    createdBy: owner.id,
  }).returning();

  const [websiteRedesign] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: designTeam.id,
    name: "Website Redesign",
    description: "Company website redesign project",
    visibility: "workspace",
    status: "active",
    color: "#8B5CF6",
    createdBy: owner.id,
  }).returning();

  const [mobileApp] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: engineeringTeam.id,
    name: "Mobile App",
    description: "Mobile application development",
    visibility: "private",
    status: "active",
    color: "#10B981",
    createdBy: owner.id,
  }).returning();

  await db.insert(projectMembers).values([
    { projectId: productLaunch.id, userId: owner.id, role: "admin" },
    { projectId: productLaunch.id, userId: member.id, role: "member" },
    { projectId: websiteRedesign.id, userId: owner.id, role: "admin" },
    { projectId: mobileApp.id, userId: owner.id, role: "admin" },
    { projectId: mobileApp.id, userId: member.id, role: "member" },
  ]);

  const [backlogSection] = await db.insert(sections).values({
    projectId: productLaunch.id,
    name: "Backlog",
    orderIndex: 0,
  }).returning();

  const [todoSection] = await db.insert(sections).values({
    projectId: productLaunch.id,
    name: "To Do",
    orderIndex: 1,
  }).returning();

  const [inProgressSection] = await db.insert(sections).values({
    projectId: productLaunch.id,
    name: "In Progress",
    orderIndex: 2,
  }).returning();

  const [doneSection] = await db.insert(sections).values({
    projectId: productLaunch.id,
    name: "Done",
    orderIndex: 3,
  }).returning();

  const [redesignBacklog] = await db.insert(sections).values({
    projectId: websiteRedesign.id,
    name: "Backlog",
    orderIndex: 0,
  }).returning();

  const [redesignInProgress] = await db.insert(sections).values({
    projectId: websiteRedesign.id,
    name: "In Progress",
    orderIndex: 1,
  }).returning();

  const [redesignReview] = await db.insert(sections).values({
    projectId: websiteRedesign.id,
    name: "Review",
    orderIndex: 2,
  }).returning();

  const [bugTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Bug", color: "#EF4444" }).returning();
  const [featureTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Feature", color: "#3B82F6" }).returning();
  const [urgentTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Urgent", color: "#F59E0B" }).returning();
  const [backendTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Backend", color: "#10B981" }).returning();
  const [frontendTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Frontend", color: "#8B5CF6" }).returning();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [task1] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: todoSection.id,
    title: "Set up CI/CD pipeline",
    description: "Configure GitHub Actions for automated testing and deployment",
    status: "todo",
    priority: "high",
    dueDate: tomorrow,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task2] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: inProgressSection.id,
    title: "Implement user authentication",
    description: "Add OAuth2 login with Google and GitHub",
    status: "in_progress",
    priority: "urgent",
    dueDate: today,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task3] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: todoSection.id,
    title: "Create API documentation",
    description: "Document all REST endpoints using OpenAPI",
    status: "todo",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: owner.id,
    orderIndex: 1,
  }).returning();

  const [task4] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: doneSection.id,
    title: "Database schema design",
    description: "Design and implement the initial database schema",
    status: "done",
    priority: "high",
    dueDate: yesterday,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task5] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: backlogSection.id,
    title: "Add email notifications",
    description: "Send email notifications for task updates and assignments",
    status: "todo",
    priority: "low",
    dueDate: null,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task6] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: inProgressSection.id,
    title: "Fix login redirect bug",
    description: "Users are not being redirected correctly after login",
    status: "in_progress",
    priority: "urgent",
    dueDate: today,
    createdBy: member.id,
    orderIndex: 1,
  }).returning();

  const [task7] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: todoSection.id,
    title: "Performance optimization",
    description: "Optimize database queries and add caching",
    status: "todo",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: owner.id,
    orderIndex: 2,
  }).returning();

  const [task8] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: backlogSection.id,
    title: "Mobile responsive design",
    description: "Ensure all pages work well on mobile devices",
    status: "todo",
    priority: "medium",
    dueDate: null,
    createdBy: owner.id,
    orderIndex: 1,
  }).returning();

  const [task9] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignInProgress.id,
    title: "Design new homepage",
    description: "Create a modern, engaging homepage design",
    status: "in_progress",
    priority: "high",
    dueDate: tomorrow,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task10] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignBacklog.id,
    title: "Update brand colors",
    description: "Implement new brand color palette across the site",
    status: "todo",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task11] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: todoSection.id,
    title: "Set up monitoring and alerts",
    description: "Configure error tracking and performance monitoring",
    status: "todo",
    priority: "high",
    dueDate: tomorrow,
    createdBy: owner.id,
    orderIndex: 3,
  }).returning();

  const [task12] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: inProgressSection.id,
    title: "Write unit tests",
    description: "Add comprehensive unit tests for core functionality",
    status: "in_progress",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: member.id,
    orderIndex: 2,
  }).returning();

  const [task13] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: doneSection.id,
    title: "Setup development environment",
    description: "Configure local development environment with Docker",
    status: "done",
    priority: "high",
    dueDate: yesterday,
    createdBy: owner.id,
    orderIndex: 1,
  }).returning();

  const [task14] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignReview.id,
    title: "Review navigation structure",
    description: "Analyze current navigation and propose improvements",
    status: "blocked",
    priority: "medium",
    dueDate: today,
    createdBy: owner.id,
    orderIndex: 0,
  }).returning();

  const [task15] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: backlogSection.id,
    title: "Implement dark mode",
    description: "Add system and manual dark mode toggle",
    status: "todo",
    priority: "low",
    dueDate: null,
    createdBy: owner.id,
    orderIndex: 2,
  }).returning();

  await db.insert(taskAssignees).values([
    { taskId: task1.id, userId: owner.id },
    { taskId: task2.id, userId: owner.id },
    { taskId: task2.id, userId: member.id },
    { taskId: task3.id, userId: member.id },
    { taskId: task4.id, userId: owner.id },
    { taskId: task5.id, userId: owner.id },
    { taskId: task6.id, userId: member.id },
    { taskId: task7.id, userId: owner.id },
    { taskId: task8.id, userId: owner.id },
    { taskId: task9.id, userId: owner.id },
    { taskId: task10.id, userId: owner.id },
    { taskId: task11.id, userId: owner.id },
    { taskId: task12.id, userId: member.id },
    { taskId: task13.id, userId: owner.id },
    { taskId: task14.id, userId: owner.id },
    { taskId: task15.id, userId: owner.id },
  ]);

  await db.insert(taskTags).values([
    { taskId: task1.id, tagId: backendTag.id },
    { taskId: task2.id, tagId: featureTag.id },
    { taskId: task2.id, tagId: backendTag.id },
    { taskId: task3.id, tagId: featureTag.id },
    { taskId: task6.id, tagId: bugTag.id },
    { taskId: task6.id, tagId: urgentTag.id },
    { taskId: task7.id, tagId: backendTag.id },
    { taskId: task8.id, tagId: frontendTag.id },
    { taskId: task9.id, tagId: frontendTag.id },
    { taskId: task10.id, tagId: frontendTag.id },
    { taskId: task11.id, tagId: backendTag.id },
    { taskId: task12.id, tagId: backendTag.id },
    { taskId: task15.id, tagId: frontendTag.id },
    { taskId: task15.id, tagId: featureTag.id },
  ]);

  await db.insert(subtasks).values([
    { taskId: task1.id, title: "Configure GitHub Actions workflow", completed: false, orderIndex: 0 },
    { taskId: task1.id, title: "Add test automation", completed: false, orderIndex: 1 },
    { taskId: task1.id, title: "Set up staging deployment", completed: true, orderIndex: 2 },
    { taskId: task2.id, title: "Implement Google OAuth", completed: true, orderIndex: 0 },
    { taskId: task2.id, title: "Implement GitHub OAuth", completed: false, orderIndex: 1 },
    { taskId: task2.id, title: "Add session management", completed: false, orderIndex: 2 },
    { taskId: task2.id, title: "Create user profile page", completed: false, orderIndex: 3 },
    { taskId: task7.id, title: "Profile slow queries", completed: false, orderIndex: 0 },
    { taskId: task7.id, title: "Add Redis caching", completed: false, orderIndex: 1 },
    { taskId: task9.id, title: "Create wireframes", completed: true, orderIndex: 0 },
    { taskId: task9.id, title: "Design hero section", completed: true, orderIndex: 1 },
    { taskId: task9.id, title: "Design features section", completed: false, orderIndex: 2 },
    { taskId: task12.id, title: "Write task service tests", completed: true, orderIndex: 0 },
    { taskId: task12.id, title: "Write project service tests", completed: false, orderIndex: 1 },
  ]);

  console.log("Database seeded successfully!");
}

seed().catch(console.error).finally(() => process.exit(0));
