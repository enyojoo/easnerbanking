import type { ReactNode } from "react"
import { PageIntro } from "@/components/copy/page-intro"

type SettingsTabIntroProps = {
  title: string
  description: string
  icon?: ReactNode
}

export function SettingsTabIntro({ title, description, icon }: SettingsTabIntroProps) {
  return <PageIntro title={title} description={description} variant="tab" icon={icon} />
}
