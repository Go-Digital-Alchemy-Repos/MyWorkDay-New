import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { promises as fs } from 'fs';
import path from 'path';
import { scanAllRoutes, createStubDocument, mergeContent, generateAutoSection } from '../../../utils/routeScanner';

export const docsRouter = Router();

const DOCS_DIR = path.join(process.cwd(), "docs");

const CATEGORY_CONFIG: Record<string, { displayName: string; icon: string; order: number }> = {
  "01-GETTING-STARTED": { displayName: "Getting Started", icon: "rocket", order: 1 },
  "02-ARCHITECTURE": { displayName: "Architecture", icon: "layout", order: 2 },
  "03-FEATURES": { displayName: "Features", icon: "star", order: 3 },
  "04-API": { displayName: "API Reference", icon: "code", order: 4 },
  "05-FRONTEND": { displayName: "Frontend", icon: "monitor", order: 5 },
  "06-BACKEND": { displayName: "Backend", icon: "server", order: 6 },
  "07-SECURITY": { displayName: "Security", icon: "shield", order: 7 },
  "08-DATABASE": { displayName: "Database", icon: "database", order: 8 },
  "09-TESTING": { displayName: "Testing", icon: "check-circle", order: 9 },
  "10-DEPLOYMENT": { displayName: "Deployment", icon: "cloud", order: 10 },
  "11-DEVELOPMENT": { displayName: "Development", icon: "wrench", order: 11 },
  "12-OPERATIONS": { displayName: "Operations", icon: "activity", order: 12 },
  "13-INTEGRATIONS": { displayName: "Integrations", icon: "plug", order: 13 },
  "14-TROUBLESHOOTING": { displayName: "Troubleshooting", icon: "alert-triangle", order: 14 },
  "15-REFERENCE": { displayName: "Reference", icon: "book", order: 15 },
  "16-CHANGELOG": { displayName: "Changelog", icon: "clock", order: 16 },
  "17-API-REGISTRY": { displayName: "API Registry", icon: "code", order: 17 },
  "18-FUNCTIONAL-DOCS": { displayName: "Functional Docs", icon: "book-open", order: 18 },
  "00-AUDIT": { displayName: "Audit Reports", icon: "check-circle", order: 0 },
  "01-REFACTOR": { displayName: "Refactor Workflows", icon: "git-branch", order: 0.5 },
  "admin": { displayName: "Admin", icon: "settings", order: 20 },
  "architecture": { displayName: "Architecture (Legacy)", icon: "layout", order: 21 },
  "auth": { displayName: "Authentication", icon: "key", order: 22 },
  "chat": { displayName: "Chat System", icon: "message-circle", order: 23 },
  "deployment": { displayName: "Deployment (Legacy)", icon: "cloud", order: 24 },
  "dev": { displayName: "Developer Guide", icon: "terminal", order: 25 },
  "integrations": { displayName: "Integrations (Legacy)", icon: "plug", order: 26 },
  "performance": { displayName: "Performance", icon: "zap", order: 27 },
  "provisioning": { displayName: "Provisioning", icon: "user-plus", order: 28 },
  "security": { displayName: "Security (Legacy)", icon: "shield", order: 29 },
  "storage": { displayName: "Storage", icon: "hard-drive", order: 30 },
  "CRM": { displayName: "CRM / Client Portal", icon: "user-plus", order: 31 },
  "_root": { displayName: "General", icon: "file-text", order: 100 },
};

async function scanDocsDirectory(): Promise<{
  categories: Array<{
    id: string;
    displayName: string;
    icon: string;
    order: number;
    docs: Array<{
      id: string;
      filename: string;
      title: string;
      category: string;
      relativePath: string;
      sizeBytes: number;
      modifiedAt: string;
    }>;
  }>;
}> {
  const categories: Map<string, typeof CATEGORY_CONFIG["_root"] & { docs: any[] }> = new Map();
  
  async function processDir(dirPath: string, categoryId: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await processDir(fullPath, entry.name);
      } else if (entry.name.endsWith(".md")) {
        const stat = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath, "utf-8");
        const firstLine = content.split("\n").find(l => l.startsWith("# "));
        const title = firstLine ? firstLine.replace(/^#\s*/, "") : entry.name.replace(".md", "");
        
        const relativePath = path.relative(DOCS_DIR, fullPath).replace(/\\/g, "/");
        const docId = relativePath.replace(/\//g, "__").replace(".md", "");
        
        if (!categories.has(categoryId)) {
          const config = CATEGORY_CONFIG[categoryId] || {
            displayName: categoryId.replace(/^\d+-/, "").replace(/-/g, " ").replace(/_/g, " "),
            icon: "folder",
            order: 50,
          };
          categories.set(categoryId, { ...config, docs: [] });
        }
        
        categories.get(categoryId)!.docs.push({
          id: docId,
          filename: entry.name,
          title,
          category: categoryId,
          relativePath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }
  
  await processDir(DOCS_DIR, "_root");
  
  const result = Array.from(categories.entries())
    .map(([id, data]) => ({
      id,
      displayName: data.displayName,
      icon: data.icon,
      order: data.order,
      docs: data.docs.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.order - b.order);
  
  return { categories: result };
}

docsRouter.get("/docs", requireSuperUser, async (req, res) => {
  try {
    const result = await scanDocsDirectory();
    res.json(result);
  } catch (error) {
    console.error("[docs] Failed to list documentation:", error);
    res.status(500).json({ error: "Failed to list documentation" });
  }
});

docsRouter.get("/docs/:docPath", requireSuperUser, async (req, res) => {
  try {
    const { docPath } = req.params;
    
    const relativePath = docPath.replace(/__/g, "/") + ".md";
    
    if (relativePath.includes("..")) {
      return res.status(400).json({ error: "Invalid path" });
    }
    
    const filepath = path.join(DOCS_DIR, relativePath);
    
    const resolvedPath = path.resolve(filepath);
    if (!resolvedPath.startsWith(path.resolve(DOCS_DIR))) {
      return res.status(400).json({ error: "Invalid path" });
    }
    
    try {
      const content = await fs.readFile(filepath, "utf-8");
      const stat = await fs.stat(filepath);
      const firstLine = content.split("\n").find(l => l.startsWith("# "));
      const title = firstLine ? firstLine.replace(/^#\s*/, "") : path.basename(relativePath, ".md");
      
      res.json({
        id: docPath,
        filename: path.basename(relativePath),
        title,
        content,
        relativePath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "Documentation file not found" });
      }
      throw err;
    }
  } catch (error) {
    console.error("[docs] Failed to read documentation:", error);
    res.status(500).json({ error: "Failed to read documentation" });
  }
});

docsRouter.post("/docs/sync", requireSuperUser, async (req, res) => {
  try {
    const API_REGISTRY_DIR = path.join(DOCS_DIR, "17-API-REGISTRY");
    
    await fs.mkdir(API_REGISTRY_DIR, { recursive: true });
    
    const domains = await scanAllRoutes();
    
    const results = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
      errors: [] as string[],
    };
    
    for (const [domainKey, domainRoutes] of Array.from(domains.entries())) {
      if (domainRoutes.routes.length === 0) {
        results.skipped.push(domainKey);
        continue;
      }
      
      const filename = `${domainRoutes.displayName.replace(/\s+/g, "-").toUpperCase()}.md`;
      const filepath = path.join(API_REGISTRY_DIR, filename);
      
      try {
        let existingContent: string | null = null;
        try {
          existingContent = await fs.readFile(filepath, "utf-8");
        } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
        }
        
        if (existingContent) {
          const autoSection = generateAutoSection(domainRoutes);
          const newContent = mergeContent(existingContent, autoSection);
          await fs.writeFile(filepath, newContent, "utf-8");
          results.updated.push(filename);
        } else {
          const content = createStubDocument(domainRoutes);
          await fs.writeFile(filepath, content, "utf-8");
          results.created.push(filename);
        }
      } catch (err: any) {
        console.error(`[docs/sync] Failed to process ${domainKey}:`, err);
        results.errors.push(`${domainKey}: ${err.message}`);
      }
    }
    
    res.json({
      success: true,
      summary: {
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      details: results,
    });
  } catch (error) {
    console.error("[docs/sync] Failed to sync API docs:", error);
    res.status(500).json({ error: "Failed to sync API docs" });
  }
});

docsRouter.get("/docs/coverage", requireSuperUser, async (req, res) => {
  try {
    const API_REGISTRY_DIR = path.join(DOCS_DIR, "17-API-REGISTRY");
    const FUNCTIONAL_DOCS_DIR = path.join(DOCS_DIR, "18-FUNCTIONAL-DOCS");
    
    const domains = await scanAllRoutes();
    
    const apiCoverage: Array<{
      domain: string;
      displayName: string;
      endpointCount: number;
      hasDoc: boolean;
      docFile: string | null;
      hasAuthNotes: boolean;
      hasExamples: boolean;
    }> = [];
    
    for (const [domainKey, domainRoutes] of Array.from(domains.entries())) {
      if (domainRoutes.routes.length === 0) continue;
      
      const filename = `${domainRoutes.displayName.replace(/\s+/g, "-").toUpperCase()}.md`;
      const filepath = path.join(API_REGISTRY_DIR, filename);
      
      let hasDoc = false;
      let hasAuthNotes = false;
      let hasExamples = false;
      
      try {
        const content = await fs.readFile(filepath, "utf-8");
        hasDoc = true;
        hasAuthNotes = content.includes("Auth Required") && !content.includes("TBD");
        hasExamples = content.includes("```json") || content.includes("```typescript");
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }
      
      apiCoverage.push({
        domain: domainKey,
        displayName: domainRoutes.displayName,
        endpointCount: domainRoutes.routes.length,
        hasDoc,
        docFile: hasDoc ? filename : null,
        hasAuthNotes,
        hasExamples,
      });
    }
    
    const requiredFunctionalDocs = [
      { id: "01-TENANCY-MODEL", name: "Tenancy Model" },
      { id: "02-AUTH-AND-ROLES", name: "Auth & Roles" },
      { id: "03-BILLING-AND-SUBSCRIPTIONS", name: "Billing & Subscriptions" },
      { id: "04-TIME-TRACKING", name: "Time Tracking" },
      { id: "05-PROJECTS-AND-TASKS", name: "Projects & Tasks" },
      { id: "06-NOTIFICATIONS", name: "Notifications" },
      { id: "07-UPLOADS-AND-FILES", name: "Uploads & Files" },
      { id: "08-AUDIT-LOGGING", name: "Audit Logging" },
    ];
    
    const functionalCoverage: Array<{
      id: string;
      name: string;
      exists: boolean;
      isEmpty: boolean;
      wordCount: number;
    }> = [];
    
    for (const doc of requiredFunctionalDocs) {
      const filepath = path.join(FUNCTIONAL_DOCS_DIR, `${doc.id}.md`);
      let exists = false;
      let isEmpty = true;
      let wordCount = 0;
      
      try {
        const content = await fs.readFile(filepath, "utf-8");
        exists = true;
        wordCount = content.split(/\s+/).length;
        isEmpty = wordCount < 100;
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }
      
      functionalCoverage.push({
        id: doc.id,
        name: doc.name,
        exists,
        isEmpty,
        wordCount,
      });
    }
    
    const apiDocsTotal = apiCoverage.length;
    const apiDocsWithDocs = apiCoverage.filter(d => d.hasDoc).length;
    const apiDocsWithAuth = apiCoverage.filter(d => d.hasAuthNotes).length;
    const apiDocsWithExamples = apiCoverage.filter(d => d.hasExamples).length;
    const totalEndpoints = apiCoverage.reduce((sum, d) => sum + d.endpointCount, 0);
    
    const funcDocsTotal = functionalCoverage.length;
    const funcDocsExists = functionalCoverage.filter(d => d.exists).length;
    const funcDocsComplete = functionalCoverage.filter(d => d.exists && !d.isEmpty).length;
    
    res.json({
      api: {
        total: apiDocsTotal,
        withDocs: apiDocsWithDocs,
        withAuth: apiDocsWithAuth,
        withExamples: apiDocsWithExamples,
        totalEndpoints,
        coverage: apiCoverage,
      },
      functional: {
        total: funcDocsTotal,
        exists: funcDocsExists,
        complete: funcDocsComplete,
        coverage: functionalCoverage,
      },
      summary: {
        apiCoveragePercent: apiDocsTotal > 0 ? Math.round((apiDocsWithDocs / apiDocsTotal) * 100) : 0,
        functionalCoveragePercent: funcDocsTotal > 0 ? Math.round((funcDocsComplete / funcDocsTotal) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("[docs/coverage] Failed to get coverage:", error);
    res.status(500).json({ error: "Failed to get documentation coverage" });
  }
});
