import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ShieldCheck, Users } from "lucide-react";

interface AccessInfoBannerProps {
  variant?: "projects" | "tasks" | "divisions" | "generic";
  className?: string;
}

const bannerContent = {
  projects: {
    icon: Users,
    title: "Limited project visibility",
    description: "You're seeing projects you've been assigned to. Contact your admin to request access to additional projects.",
  },
  tasks: {
    icon: Users,
    title: "Showing your assigned tasks",
    description: "Tasks are filtered to projects you're a member of. Request project access from your admin to see more.",
  },
  divisions: {
    icon: ShieldCheck,
    title: "Division-based access",
    description: "You can only see divisions you're a member of. Contact your admin to request access to other divisions.",
  },
  generic: {
    icon: Info,
    title: "Limited access",
    description: "Some items may be hidden based on your assignment. Contact your admin to request additional access.",
  },
};

export function AccessInfoBanner({ variant = "generic", className }: AccessInfoBannerProps) {
  const content = bannerContent[variant];
  const IconComponent = content.icon;

  return (
    <Alert className={className} data-testid={`banner-access-info-${variant}`}>
      <IconComponent className="h-4 w-4" />
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>{content.description}</AlertDescription>
    </Alert>
  );
}
