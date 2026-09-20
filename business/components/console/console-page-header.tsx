import { PageIntro } from "@/components/copy/page-intro"
import { ConsoleWorkspaceActions } from "@/components/console/console-workspace-actions"

export function ConsolePageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <PageIntro title={title} description={description} variant="page" />
      <ConsoleWorkspaceActions />
    </div>
  )
}
