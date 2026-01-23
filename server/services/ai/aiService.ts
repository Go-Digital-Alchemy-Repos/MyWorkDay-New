import OpenAI from "openai";
import { db } from "../../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.SESSION_SECRET || "dev-secret-key-32-chars-long!!";

function getEncryptionKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
}

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptApiKey(encryptedKey: string): string {
  const parts = encryptedKey.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted key format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string | null;
  maxTokens: number;
  temperature: number;
}

async function getAIConfig(): Promise<AIConfig | null> {
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
  
  if (!settings || !settings.aiEnabled || !settings.aiApiKeyEncrypted) {
    return null;
  }

  try {
    const apiKey = decryptApiKey(settings.aiApiKeyEncrypted);
    return {
      enabled: settings.aiEnabled,
      provider: settings.aiProvider || "openai",
      model: settings.aiModel || "gpt-4o-mini",
      apiKey,
      maxTokens: settings.aiMaxTokens || 2000,
      temperature: parseFloat(settings.aiTemperature || "0.7"),
    };
  } catch (error) {
    console.error("[AI] Failed to decrypt API key:", error);
    return null;
  }
}

function getOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export interface TaskBreakdownSuggestion {
  subtasks: Array<{
    title: string;
    description?: string;
    estimatedMinutes?: number;
  }>;
  reasoning?: string;
}

export interface ProjectPlanningSuggestion {
  phases: Array<{
    name: string;
    description: string;
    suggestedDuration: string;
    tasks: Array<{
      title: string;
      priority: "high" | "medium" | "low";
    }>;
  }>;
  recommendations?: string[];
}

export async function isAIEnabled(): Promise<boolean> {
  const config = await getAIConfig();
  return config !== null && config.enabled;
}

export async function testAIConnection(): Promise<{ success: boolean; message: string; model?: string }> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    return { success: false, message: "AI is not configured or API key is missing" };
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: "Say 'Hello' in one word." }],
      max_tokens: 10,
    });

    if (response.choices && response.choices.length > 0) {
      return { 
        success: true, 
        message: "Connection successful",
        model: response.model,
      };
    }
    return { success: false, message: "No response from API" };
  } catch (error: any) {
    console.error("[AI] Connection test failed:", error);
    return { 
      success: false, 
      message: error.message || "Failed to connect to OpenAI API",
    };
  }
}

export async function suggestTaskBreakdown(
  taskTitle: string,
  taskDescription?: string,
  projectContext?: string
): Promise<TaskBreakdownSuggestion | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    console.log("[AI] Task breakdown requested but AI is not configured");
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const prompt = `You are a project management assistant. Break down the following task into smaller, actionable subtasks.

Task Title: ${taskTitle}
${taskDescription ? `Task Description: ${taskDescription}` : ""}
${projectContext ? `Project Context: ${projectContext}` : ""}

Provide 3-7 subtasks that would help complete this task. For each subtask, include:
- A clear, actionable title
- A brief description (optional)
- Estimated time in minutes (optional)

Respond in JSON format:
{
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Brief description",
      "estimatedMinutes": 30
    }
  ],
  "reasoning": "Brief explanation of why you broke it down this way"
}`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return JSON.parse(content) as TaskBreakdownSuggestion;
  } catch (error: any) {
    console.error("[AI] Task breakdown failed:", error);
    throw new Error(error.message || "Failed to generate task breakdown");
  }
}

export async function suggestProjectPlan(
  projectName: string,
  projectDescription?: string,
  clientName?: string,
  teamSize?: number
): Promise<ProjectPlanningSuggestion | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    console.log("[AI] Project planning requested but AI is not configured");
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const prompt = `You are a project management assistant. Create a project plan for the following project.

Project Name: ${projectName}
${projectDescription ? `Description: ${projectDescription}` : ""}
${clientName ? `Client: ${clientName}` : ""}
${teamSize ? `Team Size: ${teamSize} people` : ""}

Create a structured project plan with phases and tasks. Each phase should have:
- A clear name
- A description of what will be accomplished
- Suggested duration (e.g., "2 weeks", "3 days")
- Key tasks within that phase with priority levels

Respond in JSON format:
{
  "phases": [
    {
      "name": "Phase name",
      "description": "What will be accomplished",
      "suggestedDuration": "1 week",
      "tasks": [
        {
          "title": "Task title",
          "priority": "high"
        }
      ]
    }
  ],
  "recommendations": ["Key recommendation 1", "Key recommendation 2"]
}`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return JSON.parse(content) as ProjectPlanningSuggestion;
  } catch (error: any) {
    console.error("[AI] Project planning failed:", error);
    throw new Error(error.message || "Failed to generate project plan");
  }
}

export async function generateTaskDescription(
  taskTitle: string,
  projectContext?: string
): Promise<string | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const prompt = `You are a project management assistant. Write a clear, concise task description for the following task.

Task Title: ${taskTitle}
${projectContext ? `Project Context: ${projectContext}` : ""}

Write a 1-3 sentence description that clarifies what needs to be done. Be specific and actionable.`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error: any) {
    console.error("[AI] Description generation failed:", error);
    throw new Error(error.message || "Failed to generate task description");
  }
}
