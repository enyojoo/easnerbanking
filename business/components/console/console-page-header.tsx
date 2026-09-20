import { PageIntro } from "@/components/copy/page-intro"

export function ConsolePageHeader({ title, description }: { title: string; description: string }) {
  return <PageIntro title={title} description={description} variant="page" />
}
