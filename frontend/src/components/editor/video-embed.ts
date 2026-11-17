// @tiptap/react가 @tiptap/core를 다시 내보내므로 core를 따로 설치하지 않는다.
import { mergeAttributes, Node } from "@tiptap/react";

// 외부 영상 임베드 (YouTube·Vimeo만)
// 서버(sanitize-html.util.ts의 VIDEO_EMBED_SRC_REGEX)가 같은 형식의 주소만 남긴다. 둘을 함께 고쳐야 한다.
// - YouTube: youtube-nocookie.com (재생 전 추적 쿠키를 남기지 않는 주소)
// - Vimeo: player.vimeo.com/video/<id>, 일부 공개 영상은 ?h=<해시>
export const VIDEO_EMBED_SRC_REGEX =
  /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d+(\?h=[0-9a-f]+)?)$/;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// 사용자가 붙여 넣은 영상 주소 → 임베드 주소 (지원하지 않는 주소면 null)
// YouTube: watch?v=ID, youtu.be/ID, shorts/ID, embed/ID, live/ID
// Vimeo: vimeo.com/ID, vimeo.com/ID/해시(일부 공개), player.vimeo.com/video/ID?h=해시
export function toVideoEmbedSrc(input: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : parts[0] === "watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(parts[0])
            ? parts[1]
            : null;
    return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const [id, hashInPath] = host === "player.vimeo.com" ? [parts[1], null] : [parts[0], parts[1]];
    if (!id || !/^\d+$/.test(id)) return null;
    const hash = url.searchParams.get("h") ?? hashInPath;
    return `https://player.vimeo.com/video/${id}${hash && /^[0-9a-f]+$/.test(hash) ? `?h=${hash}` : ""}`;
  }

  return null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      setVideoEmbed: (options: { src: string }) => ReturnType;
    };
  }
}

// 에디터 영상 노드: <div data-video-embed><iframe src="임베드 주소"></iframe></div>
// - atom: 안에 글을 쓸 수 없는 한 덩어리 (이미지처럼 선택·삭제·이동)
// - parseHTML은 허용 주소만 받는다. (서버가 지울 영상을 에디터에서도 처음부터 받지 않음 - ServerImage와 같은 원칙)
export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-video-embed] iframe",
        getAttrs: (el) => {
          const src = el.getAttribute("src") ?? "";
          return VIDEO_EMBED_SRC_REGEX.test(src) ? { src } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-video-embed": "" },
      ["iframe", mergeAttributes(HTMLAttributes, { title: "동영상", loading: "lazy", allowfullscreen: "true" })],
    ];
  },

  addCommands() {
    return {
      setVideoEmbed:
        ({ src }) =>
        ({ commands }) =>
          VIDEO_EMBED_SRC_REGEX.test(src) ? commands.insertContent({ type: this.name, attrs: { src } }) : false,
    };
  },
});
