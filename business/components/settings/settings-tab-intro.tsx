import { PageIntro } from "@/components/copy/page-intro"

type SettingsTabIntroProps = {
  title: string
  description: string
}

export function SettingsTabIntro({ title, description }: SettingsTabIntroProps) {
  return <PageIntro title={title} description={description} variant="tab" />
}
