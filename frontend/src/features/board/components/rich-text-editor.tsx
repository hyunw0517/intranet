"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  id: string;
  initialContent: string; // 수정 화면의 기존 본문 HTML (작성은 빈 문자열)
  onChange: (html: string, isEmpty: boolean) => void;
  labelledBy: string; // 폼 라벨 id (contenteditable은 <label htmlFor>로 연결되지 않는다)
}

// 게시글 본문 에디터 (Tiptap, CLAUDE.md 5.3)
// - 기능은 백엔드 sanitize-html 허용 목록 안에서만 둔다. (제목 h2·h3, 글자 서식, 목록, 인용, 코드, 링크, 구분선)
//   목록에 없는 태그를 만들 수 있게 하면 저장할 때 서버에서 사라져 "썼는데 없어지는" 문제가 생긴다.
// - immediatelyRender: false → 서버 렌더링 결과와 첫 렌더가 달라 생기는 hydration 오류 방지
// - 이미지·첨부는 파일 기능 이후 추가한다.
export function RichTextEditor({ id, initialContent, onChange, labelledBy }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }, // h1은 페이지 제목이 쓰므로 본문은 h2부터
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        class: "rich-text min-h-72 px-4 py-3 outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });

  return (
    // 포커스 표시는 Input과 같게 테두리 + ring
    <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {editor ? <Toolbar editor={editor} /> : <div className="h-10 border-b bg-muted/40" />}
      <EditorContent editor={editor} />
    </div>
  );
}

interface ToolItem {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);

  // Tiptap v3는 입력할 때마다 컴포넌트를 다시 그리지 않으므로, 버튼 활성 상태는 useEditorState로 구독한다.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const groups: ToolItem[][] = [
    [
      { icon: Heading2, label: "제목 2", active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { icon: Heading3, label: "제목 3", active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { icon: Bold, label: "굵게", active: state.bold, run: () => chain().toggleBold().run() },
      { icon: Italic, label: "기울임", active: state.italic, run: () => chain().toggleItalic().run() },
      { icon: Underline, label: "밑줄", active: state.underline, run: () => chain().toggleUnderline().run() },
      { icon: Strikethrough, label: "취소선", active: state.strike, run: () => chain().toggleStrike().run() },
      { icon: Code, label: "인라인 코드", active: state.code, run: () => chain().toggleCode().run() },
      { icon: Link2, label: "링크", active: state.link, run: () => setLinkOpen(true) },
    ],
    [
      { icon: List, label: "글머리 목록", active: state.bulletList, run: () => chain().toggleBulletList().run() },
      { icon: ListOrdered, label: "번호 목록", active: state.orderedList, run: () => chain().toggleOrderedList().run() },
      { icon: Quote, label: "인용", active: state.blockquote, run: () => chain().toggleBlockquote().run() },
      { icon: SquareCode, label: "코드 블록", active: state.codeBlock, run: () => chain().toggleCodeBlock().run() },
      { icon: Minus, label: "구분선", run: () => chain().setHorizontalRule().run() },
    ],
    [
      { icon: Undo2, label: "실행 취소", disabled: !state.canUndo, run: () => chain().undo().run() },
      { icon: Redo2, label: "다시 실행", disabled: !state.canRedo, run: () => chain().redo().run() },
    ],
  ];

  return (
    <>
      <div role="toolbar" aria-label="본문 서식" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
        {groups.map((group, gi) => (
          <div key={gi} className={cn("flex items-center gap-0.5", gi > 0 && "border-l pl-1 ml-0.5")}>
            {group.map((item) => (
              <Button
                key={item.label}
                type="button"
                variant="ghost"
                size="icon-sm"
                title={item.label}
                aria-label={item.label}
                aria-pressed={item.active ?? undefined}
                disabled={item.disabled}
                // 마우스로 눌러도 포커스·선택 영역을 에디터에 남긴다. (버튼이 포커스를 가져가면 바로 이어 친 Enter가 버튼을 다시 누름)
                // 키보드(Tab → Space/Enter)로는 그대로 조작할 수 있다.
                onMouseDown={(e) => e.preventDefault()}
                onClick={item.run}
                className={cn(item.active && "bg-accent text-foreground")}
              >
                <item.icon />
              </Button>
            ))}
          </div>
        ))}
      </div>
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
    </>
  );
}

// 서버 허용 스킴과 같다. (javascript: 등은 서버에서도 제거된다)
const ALLOWED_LINK = /^(https?:\/\/|mailto:)/i;

function LinkDialog({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* 열 때마다 현재 링크 값으로 입력을 초기화하기 위해 내용만 다시 마운트 */}
        {open && <LinkForm editor={editor} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Dialog는 화면에서는 portal로 밖에 그려지지만 React 트리에서는 게시글 <form> 안이다.
    // React 이벤트는 React 트리를 따라 전파되므로, 막지 않으면 게시글 폼의 onSubmit까지 실행되어 글이 등록된다.
    e.stopPropagation();
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      onDone();
      return;
    }
    // 스킴이 없으면 https로 본다. (example.com → https://example.com)
    const url = ALLOWED_LINK.test(value) ? value : /^[a-z][a-z0-9+.-]*:/i.test(value) ? null : `https://${value}`;
    if (!url) {
      setError("http, https, mailto 주소만 넣을 수 있습니다.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    // 선택한 글자가 없으면 주소를 글자로 넣는다.
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href: url } }] }).run();
    } else {
      chain.setLink({ href: url }).run();
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>링크</DialogTitle>
        <DialogDescription>선택한 글자에 링크를 겁니다. 비워 두고 저장하면 링크를 제거합니다.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="link-href">주소</Label>
        <Input
          id="link-href"
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setError(null);
          }}
          placeholder="https://"
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? "link-href-message" : undefined}
        />
        {error && (
          <p id="link-href-message" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          취소
        </Button>
        <Button type="submit">저장</Button>
      </DialogFooter>
    </form>
  );
}
