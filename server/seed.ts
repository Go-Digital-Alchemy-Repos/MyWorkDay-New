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
import { hashPassword } from "./auth";

const DEMO_WORKSPACE_ID = "demo-workspace-id";

async function seed() {
  console.log("Seeding database...");

  await db.execute(sql`TRUNCATE TABLE comment_mentions, app_settings, client_user_access, invitations, activity_log, notifications, comments, task_tags, tags, subtasks, task_assignees, tasks, sections, project_members, projects, team_members, teams, workspace_members, workspaces, users CASCADE`);

  const adminPasswordHash = await hashPassword("admin123");
  const userPasswordHash = await hashPassword("password123");

  const [admin] = await db.insert(users).values({
    id: "admin-user-id",
    email: "admin@dasana.com",
    name: "Admin User",
    firstName: "Admin",
    lastName: "User",
    passwordHash: adminPasswordHash,
    role: "admin",
    isActive: true,
  }).returning();

  const [sarah] = await db.insert(users).values({
    id: "sarah-user-id",
    email: "sarah@dasana.com",
    name: "Sarah Chen",
    firstName: "Sarah",
    lastName: "Chen",
    passwordHash: userPasswordHash,
    role: "employee",
    isActive: true,
  }).returning();

  const [marcus] = await db.insert(users).values({
    id: "marcus-user-id",
    email: "marcus@dasana.com",
    name: "Marcus Johnson",
    firstName: "Marcus",
    lastName: "Johnson",
    passwordHash: userPasswordHash,
    role: "employee",
    isActive: true,
  }).returning();

  const [emily] = await db.insert(users).values({
    id: "emily-user-id",
    email: "emily@dasana.com",
    name: "Emily Rodriguez",
    firstName: "Emily",
    lastName: "Rodriguez",
    passwordHash: userPasswordHash,
    role: "employee",
    isActive: true,
  }).returning();

  const [alex] = await db.insert(users).values({
    id: "alex-user-id",
    email: "alex@dasana.com",
    name: "Alex Kim",
    firstName: "Alex",
    lastName: "Kim",
    passwordHash: userPasswordHash,
    role: "employee",
    isActive: true,
  }).returning();

  const [jordan] = await db.insert(users).values({
    id: "jordan-user-id",
    email: "jordan@dasana.com",
    name: "Jordan Taylor",
    firstName: "Jordan",
    lastName: "Taylor",
    passwordHash: userPasswordHash,
    role: "employee",
    isActive: true,
  }).returning();

  const [clientUser] = await db.insert(users).values({
    id: "client-user-id",
    email: "client@example.com",
    name: "Client User",
    firstName: "Client",
    lastName: "User",
    passwordHash: userPasswordHash,
    role: "client",
    isActive: true,
  }).returning();

  const [workspace] = await db.insert(workspaces).values({
    id: DEMO_WORKSPACE_ID,
    name: "DASANA Workspace",
    createdBy: admin.id,
  }).returning();

  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: admin.id, role: "owner", status: "active" },
    { workspaceId: workspace.id, userId: sarah.id, role: "admin", status: "active" },
    { workspaceId: workspace.id, userId: marcus.id, role: "member", status: "active" },
    { workspaceId: workspace.id, userId: emily.id, role: "member", status: "active" },
    { workspaceId: workspace.id, userId: alex.id, role: "member", status: "active" },
    { workspaceId: workspace.id, userId: jordan.id, role: "guest", status: "active" },
  ]);

  const [engineeringTeam] = await db.insert(teams).values({
    workspaceId: workspace.id,
    name: "Engineering",
  }).returning();

  const [designTeam] = await db.insert(teams).values({
    workspaceId: workspace.id,
    name: "Design",
  }).returning();

  const [marketingTeam] = await db.insert(teams).values({
    workspaceId: workspace.id,
    name: "Marketing",
  }).returning();

  await db.insert(teamMembers).values([
    { teamId: engineeringTeam.id, userId: admin.id },
    { teamId: engineeringTeam.id, userId: sarah.id },
    { teamId: engineeringTeam.id, userId: marcus.id },
    { teamId: designTeam.id, userId: admin.id },
    { teamId: designTeam.id, userId: emily.id },
    { teamId: marketingTeam.id, userId: alex.id },
    { teamId: marketingTeam.id, userId: jordan.id },
  ]);

  const [productLaunch] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: engineeringTeam.id,
    name: "Product Launch",
    description: "Q1 2026 product launch planning and execution",
    visibility: "workspace",
    status: "active",
    color: "#3B82F6",
    createdBy: admin.id,
  }).returning();

  const [websiteRedesign] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: designTeam.id,
    name: "Website Redesign",
    description: "Company website redesign project",
    visibility: "workspace",
    status: "active",
    color: "#8B5CF6",
    createdBy: admin.id,
  }).returning();

  const [mobileApp] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: engineeringTeam.id,
    name: "Mobile App",
    description: "Mobile application development for iOS and Android",
    visibility: "private",
    status: "active",
    color: "#10B981",
    createdBy: admin.id,
  }).returning();

  const [marketingCampaign] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: marketingTeam.id,
    name: "Marketing Campaign",
    description: "Spring 2026 marketing campaign",
    visibility: "workspace",
    status: "active",
    color: "#F59E0B",
    createdBy: alex.id,
  }).returning();

  const [apiIntegration] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: engineeringTeam.id,
    name: "API Integration",
    description: "Third-party API integrations and partnerships",
    visibility: "private",
    status: "active",
    color: "#EF4444",
    createdBy: sarah.id,
  }).returning();

  const [userResearch] = await db.insert(projects).values({
    workspaceId: workspace.id,
    teamId: designTeam.id,
    name: "User Research",
    description: "User interviews and usability testing",
    visibility: "workspace",
    status: "active",
    color: "#06B6D4",
    createdBy: emily.id,
  }).returning();

  await db.insert(projectMembers).values([
    { projectId: productLaunch.id, userId: admin.id, role: "admin" },
    { projectId: productLaunch.id, userId: sarah.id, role: "member" },
    { projectId: productLaunch.id, userId: marcus.id, role: "member" },
    { projectId: websiteRedesign.id, userId: admin.id, role: "admin" },
    { projectId: websiteRedesign.id, userId: emily.id, role: "member" },
    { projectId: mobileApp.id, userId: admin.id, role: "admin" },
    { projectId: mobileApp.id, userId: sarah.id, role: "member" },
    { projectId: mobileApp.id, userId: marcus.id, role: "member" },
    { projectId: marketingCampaign.id, userId: alex.id, role: "admin" },
    { projectId: marketingCampaign.id, userId: jordan.id, role: "member" },
    { projectId: apiIntegration.id, userId: sarah.id, role: "admin" },
    { projectId: apiIntegration.id, userId: marcus.id, role: "member" },
    { projectId: userResearch.id, userId: emily.id, role: "admin" },
    { projectId: userResearch.id, userId: admin.id, role: "member" },
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

  const [mobileBacklog] = await db.insert(sections).values({
    projectId: mobileApp.id,
    name: "Backlog",
    orderIndex: 0,
  }).returning();

  const [mobileDev] = await db.insert(sections).values({
    projectId: mobileApp.id,
    name: "Development",
    orderIndex: 1,
  }).returning();

  const [mobileTesting] = await db.insert(sections).values({
    projectId: mobileApp.id,
    name: "Testing",
    orderIndex: 2,
  }).returning();

  const [marketingPlanning] = await db.insert(sections).values({
    projectId: marketingCampaign.id,
    name: "Planning",
    orderIndex: 0,
  }).returning();

  const [marketingExecution] = await db.insert(sections).values({
    projectId: marketingCampaign.id,
    name: "Execution",
    orderIndex: 1,
  }).returning();

  const [apiTodo] = await db.insert(sections).values({
    projectId: apiIntegration.id,
    name: "To Do",
    orderIndex: 0,
  }).returning();

  const [apiInProgress] = await db.insert(sections).values({
    projectId: apiIntegration.id,
    name: "In Progress",
    orderIndex: 1,
  }).returning();

  const [researchPlanning] = await db.insert(sections).values({
    projectId: userResearch.id,
    name: "Planning",
    orderIndex: 0,
  }).returning();

  const [researchActive] = await db.insert(sections).values({
    projectId: userResearch.id,
    name: "Active",
    orderIndex: 1,
  }).returning();

  const [bugTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Bug", color: "#EF4444" }).returning();
  const [featureTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Feature", color: "#3B82F6" }).returning();
  const [urgentTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Urgent", color: "#F59E0B" }).returning();
  const [backendTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Backend", color: "#10B981" }).returning();
  const [frontendTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Frontend", color: "#8B5CF6" }).returning();
  const [designTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Design", color: "#EC4899" }).returning();
  const [docsTag] = await db.insert(tags).values({ workspaceId: workspace.id, name: "Documentation", color: "#6B7280" }).returning();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const inThreeDays = new Date(today);
  inThreeDays.setDate(inThreeDays.getDate() + 3);

  const [task1] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: todoSection.id,
    title: "Set up CI/CD pipeline",
    description: "Configure GitHub Actions for automated testing and deployment",
    status: "todo",
    priority: "high",
    dueDate: tomorrow,
    createdBy: admin.id,
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
    createdBy: admin.id,
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
    createdBy: admin.id,
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
    createdBy: admin.id,
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
    createdBy: admin.id,
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
    createdBy: marcus.id,
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
    createdBy: admin.id,
    orderIndex: 2,
  }).returning();

  const [task8] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignInProgress.id,
    title: "Design new homepage",
    description: "Create a modern, engaging homepage design",
    status: "in_progress",
    priority: "high",
    dueDate: tomorrow,
    createdBy: emily.id,
    orderIndex: 0,
  }).returning();

  const [task9] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignBacklog.id,
    title: "Update brand colors",
    description: "Implement new brand color palette across the site",
    status: "todo",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: emily.id,
    orderIndex: 0,
  }).returning();

  const [task10] = await db.insert(tasks).values({
    projectId: websiteRedesign.id,
    sectionId: redesignReview.id,
    title: "Review navigation structure",
    description: "Analyze current navigation and propose improvements",
    status: "blocked",
    priority: "medium",
    dueDate: today,
    createdBy: admin.id,
    orderIndex: 0,
  }).returning();

  const [task11] = await db.insert(tasks).values({
    projectId: mobileApp.id,
    sectionId: mobileDev.id,
    title: "Implement push notifications",
    description: "Add support for push notifications on iOS and Android",
    status: "in_progress",
    priority: "high",
    dueDate: inThreeDays,
    createdBy: sarah.id,
    orderIndex: 0,
  }).returning();

  const [task12] = await db.insert(tasks).values({
    projectId: mobileApp.id,
    sectionId: mobileBacklog.id,
    title: "Offline mode support",
    description: "Enable app to work without internet connection",
    status: "todo",
    priority: "medium",
    dueDate: null,
    createdBy: sarah.id,
    orderIndex: 0,
  }).returning();

  const [task13] = await db.insert(tasks).values({
    projectId: mobileApp.id,
    sectionId: mobileTesting.id,
    title: "Beta testing round 1",
    description: "Conduct first round of beta testing with users",
    status: "in_progress",
    priority: "high",
    dueDate: tomorrow,
    createdBy: marcus.id,
    orderIndex: 0,
  }).returning();

  const [task14] = await db.insert(tasks).values({
    projectId: marketingCampaign.id,
    sectionId: marketingPlanning.id,
    title: "Define campaign goals",
    description: "Set clear KPIs and goals for the marketing campaign",
    status: "todo",
    priority: "high",
    dueDate: today,
    createdBy: alex.id,
    orderIndex: 0,
  }).returning();

  const [task15] = await db.insert(tasks).values({
    projectId: marketingCampaign.id,
    sectionId: marketingExecution.id,
    title: "Create social media content",
    description: "Design and write content for social media posts",
    status: "in_progress",
    priority: "medium",
    dueDate: inThreeDays,
    createdBy: jordan.id,
    orderIndex: 0,
  }).returning();

  const [task16] = await db.insert(tasks).values({
    projectId: apiIntegration.id,
    sectionId: apiInProgress.id,
    title: "Stripe payment integration",
    description: "Integrate Stripe for payment processing",
    status: "in_progress",
    priority: "urgent",
    dueDate: today,
    createdBy: sarah.id,
    orderIndex: 0,
  }).returning();

  const [task17] = await db.insert(tasks).values({
    projectId: apiIntegration.id,
    sectionId: apiTodo.id,
    title: "Slack notifications integration",
    description: "Send notifications to Slack channels",
    status: "todo",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: marcus.id,
    orderIndex: 0,
  }).returning();

  const [task18] = await db.insert(tasks).values({
    projectId: userResearch.id,
    sectionId: researchActive.id,
    title: "Conduct user interviews",
    description: "Interview 10 users about their workflow needs",
    status: "in_progress",
    priority: "high",
    dueDate: inThreeDays,
    createdBy: emily.id,
    orderIndex: 0,
  }).returning();

  const [task19] = await db.insert(tasks).values({
    projectId: userResearch.id,
    sectionId: researchPlanning.id,
    title: "Create usability test plan",
    description: "Design test scenarios and success metrics",
    status: "todo",
    priority: "medium",
    dueDate: tomorrow,
    createdBy: emily.id,
    orderIndex: 0,
  }).returning();

  const [task20] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: doneSection.id,
    title: "Setup development environment",
    description: "Configure local development environment with Docker",
    status: "done",
    priority: "high",
    dueDate: twoDaysAgo,
    createdBy: admin.id,
    orderIndex: 1,
  }).returning();

  const [task21] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: inProgressSection.id,
    title: "Write unit tests",
    description: "Add comprehensive unit tests for core functionality",
    status: "in_progress",
    priority: "medium",
    dueDate: nextWeek,
    createdBy: marcus.id,
    orderIndex: 2,
  }).returning();

  const [task22] = await db.insert(tasks).values({
    projectId: productLaunch.id,
    sectionId: backlogSection.id,
    title: "Implement dark mode",
    description: "Add system and manual dark mode toggle",
    status: "todo",
    priority: "low",
    dueDate: null,
    createdBy: admin.id,
    orderIndex: 1,
  }).returning();

  await db.insert(taskAssignees).values([
    { taskId: task1.id, userId: admin.id },
    { taskId: task2.id, userId: admin.id },
    { taskId: task2.id, userId: sarah.id },
    { taskId: task3.id, userId: marcus.id },
    { taskId: task4.id, userId: admin.id },
    { taskId: task5.id, userId: admin.id },
    { taskId: task6.id, userId: marcus.id },
    { taskId: task7.id, userId: admin.id },
    { taskId: task7.id, userId: sarah.id },
    { taskId: task8.id, userId: emily.id },
    { taskId: task9.id, userId: emily.id },
    { taskId: task10.id, userId: admin.id },
    { taskId: task10.id, userId: emily.id },
    { taskId: task11.id, userId: sarah.id },
    { taskId: task11.id, userId: marcus.id },
    { taskId: task12.id, userId: sarah.id },
    { taskId: task13.id, userId: marcus.id },
    { taskId: task14.id, userId: alex.id },
    { taskId: task15.id, userId: jordan.id },
    { taskId: task15.id, userId: alex.id },
    { taskId: task16.id, userId: sarah.id },
    { taskId: task17.id, userId: marcus.id },
    { taskId: task18.id, userId: emily.id },
    { taskId: task19.id, userId: emily.id },
    { taskId: task20.id, userId: admin.id },
    { taskId: task21.id, userId: marcus.id },
    { taskId: task22.id, userId: admin.id },
  ]);

  await db.insert(taskTags).values([
    { taskId: task1.id, tagId: backendTag.id },
    { taskId: task2.id, tagId: featureTag.id },
    { taskId: task2.id, tagId: backendTag.id },
    { taskId: task3.id, tagId: docsTag.id },
    { taskId: task6.id, tagId: bugTag.id },
    { taskId: task6.id, tagId: urgentTag.id },
    { taskId: task7.id, tagId: backendTag.id },
    { taskId: task8.id, tagId: designTag.id },
    { taskId: task8.id, tagId: frontendTag.id },
    { taskId: task9.id, tagId: designTag.id },
    { taskId: task10.id, tagId: designTag.id },
    { taskId: task11.id, tagId: featureTag.id },
    { taskId: task13.id, tagId: featureTag.id },
    { taskId: task14.id, tagId: urgentTag.id },
    { taskId: task16.id, tagId: backendTag.id },
    { taskId: task16.id, tagId: urgentTag.id },
    { taskId: task17.id, tagId: backendTag.id },
    { taskId: task18.id, tagId: designTag.id },
    { taskId: task21.id, tagId: backendTag.id },
    { taskId: task22.id, tagId: frontendTag.id },
    { taskId: task22.id, tagId: featureTag.id },
  ]);

  await db.insert(subtasks).values([
    { taskId: task1.id, title: "Configure GitHub Actions workflow", completed: false, orderIndex: 0 },
    { taskId: task1.id, title: "Add test automation", completed: false, orderIndex: 1 },
    { taskId: task1.id, title: "Set up staging deployment", completed: true, orderIndex: 2 },
    { taskId: task1.id, title: "Configure production deployment", completed: false, orderIndex: 3 },
    { taskId: task2.id, title: "Implement Google OAuth", completed: true, orderIndex: 0 },
    { taskId: task2.id, title: "Implement GitHub OAuth", completed: false, orderIndex: 1 },
    { taskId: task2.id, title: "Add session management", completed: false, orderIndex: 2 },
    { taskId: task2.id, title: "Create user profile page", completed: false, orderIndex: 3 },
    { taskId: task3.id, title: "Document authentication endpoints", completed: false, orderIndex: 0 },
    { taskId: task3.id, title: "Document task endpoints", completed: false, orderIndex: 1 },
    { taskId: task3.id, title: "Add example requests", completed: false, orderIndex: 2 },
    { taskId: task7.id, title: "Profile slow queries", completed: false, orderIndex: 0 },
    { taskId: task7.id, title: "Add Redis caching", completed: false, orderIndex: 1 },
    { taskId: task7.id, title: "Implement connection pooling", completed: false, orderIndex: 2 },
    { taskId: task8.id, title: "Create wireframes", completed: true, orderIndex: 0 },
    { taskId: task8.id, title: "Design hero section", completed: true, orderIndex: 1 },
    { taskId: task8.id, title: "Design features section", completed: false, orderIndex: 2 },
    { taskId: task8.id, title: "Design pricing section", completed: false, orderIndex: 3 },
    { taskId: task11.id, title: "Set up Firebase Cloud Messaging", completed: true, orderIndex: 0 },
    { taskId: task11.id, title: "Implement iOS notifications", completed: false, orderIndex: 1 },
    { taskId: task11.id, title: "Implement Android notifications", completed: false, orderIndex: 2 },
    { taskId: task13.id, title: "Recruit beta testers", completed: true, orderIndex: 0 },
    { taskId: task13.id, title: "Distribute test builds", completed: true, orderIndex: 1 },
    { taskId: task13.id, title: "Collect feedback", completed: false, orderIndex: 2 },
    { taskId: task14.id, title: "Define target audience", completed: false, orderIndex: 0 },
    { taskId: task14.id, title: "Set budget", completed: false, orderIndex: 1 },
    { taskId: task14.id, title: "Create timeline", completed: false, orderIndex: 2 },
  ]);

  console.log("Database seeded successfully!");
  console.log("\n=== LOGIN CREDENTIALS ===");
  console.log("Admin:    admin@dasana.com / admin123");
  console.log("Employee: sarah@dasana.com / password123");
  console.log("Client:   client@example.com / password123");
  console.log("==========================\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
