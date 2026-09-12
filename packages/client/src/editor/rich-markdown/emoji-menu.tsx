import type { Editor } from '@tiptap/react'
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react'
import React from 'react'

type RichMarkdownEmojiMenuProps = {
  editor: Editor | null
  left: number
  top: number
  onClose: () => void
}

export function RichMarkdownEmojiMenu({
  editor,
  left,
  top,
  onClose
}: RichMarkdownEmojiMenuProps): React.JSX.Element {
  const insertEmoji = (emojiData: EmojiClickData): void => {
    editor?.chain().focus().insertContent(emojiData.emoji).run()
    onClose()
  }

  return (
    <div
      // Why: `rich-markdown-emoji-menu` stays a stable hook for the
      // EmojiPickerReact CSS-variable overrides in rich-markdown-content.css —
      // the picker is a third-party component with no Tailwind classNames.
      className="rich-markdown-emoji-menu bg-popover text-popover-foreground absolute z-[31] overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--border)_76%,transparent)]"
      style={{ left, top }}
      role="dialog"
    >
      <EmojiPicker
        autoFocusSearch
        emojiStyle={EmojiStyle.NATIVE}
        height={360}
        lazyLoadEmojis
        onEmojiClick={insertEmoji}
        previewConfig={{ showPreview: false }}
        searchPlaceHolder="Search emoji"
        skinTonesDisabled
        theme={Theme.AUTO}
        width={320}
      />
    </div>
  )
}
