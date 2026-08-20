"use client"

import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

/**
 * Easner toast wrapper – muted semantic palette, private-bank tone.
 *
 * Use `next-themes` if available; otherwise default to system colour scheme.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors={false}
      theme="system"
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-2xl border border-border/60 bg-card text-card-foreground shadow-[var(--shadow-card)] p-4',
          title: 'text-sm font-semibold tracking-tight',
          description: 'text-sm text-muted-foreground',
          actionButton:
            'inline-flex h-8 items-center rounded-xl bg-foreground px-3 text-xs font-medium text-background',
          cancelButton:
            'inline-flex h-8 items-center rounded-xl bg-muted px-3 text-xs font-medium text-foreground',
          success:
            'bg-card text-card-foreground [&_[data-icon]]:text-primary',
          error:
            'bg-card text-card-foreground [&_[data-icon]]:text-destructive',
          warning:
            'bg-card text-card-foreground [&_[data-icon]]:text-[hsl(var(--warning))]',
          info:
            'bg-card text-card-foreground [&_[data-icon]]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
