// Why: every tab type uses the same compact overlay contract so revealing close
// never changes tab width or chrome, while keyboard focus remains an accessible fallback.
export const TAB_CLOSE_BUTTON_CLASSES =
  'pointer-events-none absolute right-2 z-10 flex size-5 items-center justify-center text-muted-foreground opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:text-accent-foreground hover:text-accent-foreground'
