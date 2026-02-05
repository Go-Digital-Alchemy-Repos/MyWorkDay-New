import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FileStack,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Layers,
  CheckSquare,
  ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectTemplate, ProjectTemplateContent } from "@shared/schema";

interface TemplateSection {
  name: string;
  tasks: Array<{
    title: string;
    description?: string;
    subtasks?: string[];
  }>;
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
  isLoading,
}: {
  template?: ProjectTemplate;
  onSave: (data: { name: string; description?: string; category: string; content: ProjectTemplateContent }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const content = template?.content as ProjectTemplateContent | undefined;
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [category, setCategory] = useState(template?.category || "general");
  const [sections, setSections] = useState<TemplateSection[]>(
    content?.sections || [{ name: "Section 1", tasks: [] }]
  );
  const [bulkInput, setBulkInput] = useState("");

  const handleAddSection = () => {
    setSections([...sections, { name: `Section ${sections.length + 1}`, tasks: [] }]);
  };

  const handleRemoveSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const handleUpdateSectionName = (index: number, newName: string) => {
    const updated = [...sections];
    updated[index].name = newName;
    setSections(updated);
  };

  const handleAddTask = (sectionIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].tasks.push({ title: "New Task" });
    setSections(updated);
  };

  const handleRemoveTask = (sectionIndex: number, taskIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].tasks = updated[sectionIndex].tasks.filter((_, i) => i !== taskIndex);
    setSections(updated);
  };

  const handleUpdateTask = (sectionIndex: number, taskIndex: number, field: string, value: string) => {
    const updated = [...sections];
    if (field === "title") {
      updated[sectionIndex].tasks[taskIndex].title = value;
    } else if (field === "description") {
      updated[sectionIndex].tasks[taskIndex].description = value;
    }
    setSections(updated);
  };

  const handleParseBulkInput = () => {
    if (!bulkInput.trim()) return;

    const lines = bulkInput.split("\n").filter(line => line.trim());
    const newSections: TemplateSection[] = [];
    let currentSection: TemplateSection | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("##")) {
        if (currentSection) {
          newSections.push(currentSection);
        }
        currentSection = { name: trimmed.replace(/^##\s*/, ""), tasks: [] };
      } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        if (!currentSection) {
          currentSection = { name: "Tasks", tasks: [] };
        }
        currentSection.tasks.push({ title: trimmed.replace(/^[-*]\s*/, "") });
      } else if (trimmed) {
        if (!currentSection) {
          currentSection = { name: "Tasks", tasks: [] };
        }
        currentSection.tasks.push({ title: trimmed });
      }
    }

    if (currentSection && currentSection.tasks.length > 0) {
      newSections.push(currentSection);
    }

    if (newSections.length > 0) {
      setSections([...sections, ...newSections]);
      setBulkInput("");
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name,
      description: description || undefined,
      category,
      content: { sections },
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Template Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Client Onboarding"
            data-testid="input-template-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., general, onboarding, website"
            data-testid="input-template-category"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this template is used for..."
          data-testid="textarea-template-description"
        />
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Sections & Tasks</Label>
          <Button variant="outline" size="sm" onClick={handleAddSection} data-testid="button-add-section">
            <Plus className="h-4 w-4 mr-1" />
            Add Section
          </Button>
        </div>

        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={section.name}
                  onChange={(e) => handleUpdateSectionName(sIdx, e.target.value)}
                  className="flex-1"
                  data-testid={`input-section-name-${sIdx}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSection(sIdx)}
                  data-testid={`button-remove-section-${sIdx}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="pl-6 space-y-2">
                {section.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={task.title}
                      onChange={(e) => handleUpdateTask(sIdx, tIdx, "title", e.target.value)}
                      className="flex-1"
                      placeholder="Task title"
                      data-testid={`input-task-title-${sIdx}-${tIdx}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTask(sIdx, tIdx)}
                      data-testid={`button-remove-task-${sIdx}-${tIdx}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddTask(sIdx)}
                  className="text-muted-foreground"
                  data-testid={`button-add-task-${sIdx}`}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Task
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-medium">Paste Tasks (Bulk Import)</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste a list of tasks. Use "## Section Name" for sections, and "-" or lines for tasks.
        </p>
        <Textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder={`## Section Name\n- Task 1\n- Task 2\n\n## Another Section\n- Task 3`}
          className="min-h-[120px]"
          data-testid="textarea-bulk-input"
        />
        <Button variant="outline" size="sm" onClick={handleParseBulkInput} data-testid="button-parse-bulk">
          <Plus className="h-4 w-4 mr-1" />
          Parse and Add
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-template">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading || !name.trim()} data-testid="button-save-template">
          {isLoading ? "Saving..." : template ? "Update Template" : "Create Template"}
        </Button>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | undefined>();

  const isAdmin = user?.role === "admin" || user?.role === "super_user";

  const { data: templates = [], isLoading } = useQuery<ProjectTemplate[]>({
    queryKey: ["/api/project-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category: string; content: ProjectTemplateContent }) => {
      return apiRequest("POST", "/api/project-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template created", description: "Your project template has been saved." });
      setIsDialogOpen(false);
      setEditingTemplate(undefined);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create template.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; description?: string; category: string; content: ProjectTemplateContent }) => {
      return apiRequest("PATCH", `/api/project-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template updated", description: "Your changes have been saved." });
      setIsDialogOpen(false);
      setEditingTemplate(undefined);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/project-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template deleted", description: "The template has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Redirect to="/" />;
  }

  const handleSave = (data: { name: string; description?: string; category: string; content: ProjectTemplateContent }) => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (template: ProjectTemplate) => {
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(undefined);
    setIsDialogOpen(true);
  };

  const getTaskCount = (template: ProjectTemplate) => {
    const content = template.content as ProjectTemplateContent;
    return content?.sections?.reduce((acc, section) => acc + section.tasks.length, 0) || 0;
  };

  const getSectionCount = (template: ProjectTemplate) => {
    const content = template.content as ProjectTemplateContent;
    return content?.sections?.length || 0;
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-5xl py-8 px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileStack className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Project Templates</h1>
              <p className="text-muted-foreground text-sm">
                Create reusable templates with predefined sections and tasks
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate} data-testid="button-create-template">
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? "Edit Template" : "Create Template"}
                </DialogTitle>
                <DialogDescription>
                  {editingTemplate
                    ? "Modify your project template settings and structure."
                    : "Create a new project template with sections and tasks."}
                </DialogDescription>
              </DialogHeader>
              <TemplateEditor
                template={editingTemplate}
                onSave={handleSave}
                onCancel={() => setIsDialogOpen(false)}
                isLoading={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="h-24 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileStack className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No templates yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first template to speed up project setup.
              </p>
              <Button onClick={handleCreate} data-testid="button-create-first-template">
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className="hover-elevate">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1">
                          {template.description}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant="secondary">{template.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1">
                      <Layers className="h-4 w-4" />
                      {getSectionCount(template)} sections
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckSquare className="h-4 w-4" />
                      {getTaskCount(template)} tasks
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{template.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(template.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-confirm-delete"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
