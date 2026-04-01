"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Hash, Users } from "lucide-react";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import { useWorkspaceStore } from "@/features/workspace";
import { useIssueStore } from "@/features/issues";
import { ActorAvatar } from "@/components/common/actor-avatar";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentionItem {
  id: string;
  label: string;
  type: "member" | "agent" | "issue" | "all";
  /** Secondary text shown below the label (e.g. issue title) */
  description?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// ---------------------------------------------------------------------------
// MentionList — the popup rendered inside the editor
// ---------------------------------------------------------------------------

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No results
        </div>
      );
    }

    return (
      <div className="rounded-md border bg-popover py-1 shadow-md min-w-[180px] max-h-[240px] overflow-y-auto">
        {items.map((item, index) => (
          <button
            ref={(el) => { itemRefs.current[index] = el; }}
            key={`${item.type}-${item.id}`}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
              index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
            }`}
            onClick={() => selectItem(index)}
          >
            {item.type === "all" ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-3 w-3" />
              </span>
            ) : item.type === "issue" ? (
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Hash className="h-3 w-3" />
              </span>
            ) : (
              <ActorAvatar
                actorType={item.type}
                actorId={item.id}
                size={20}
              />
            )}
            <div className="flex flex-col min-w-0">
              <span className="truncate">{item.label}</span>
              {item.description && (
                <span className="truncate text-xs text-muted-foreground">{item.description}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Suggestion config factory
// ---------------------------------------------------------------------------

export function createMentionSuggestion(): Omit<
  SuggestionOptions<MentionItem>,
  "editor"
> {
  return {
    items: ({ query }) => {
      const { members, agents } = useWorkspaceStore.getState();
      const { issues } = useIssueStore.getState();
      const q = query.toLowerCase();

      // Show "All members" option when query is empty or matches "all"
      const allItem: MentionItem[] =
        "all members".includes(q) || "all".includes(q)
          ? [{ id: "all", label: "All members", type: "all" as const, description: "Notify all members" }]
          : [];

      const memberItems: MentionItem[] = members
        .filter((m) => m.name.toLowerCase().includes(q))
        .map((m) => ({
          id: m.user_id,
          label: m.name,
          type: "member" as const,
        }));

      const agentItems: MentionItem[] = agents
        .filter((a) => a.name.toLowerCase().includes(q))
        .map((a) => ({ id: a.id, label: a.name, type: "agent" as const }));

      const issueItems: MentionItem[] = issues
        .filter(
          (i) =>
            i.identifier.toLowerCase().includes(q) ||
            i.title.toLowerCase().includes(q),
        )
        .map((i) => ({
          id: i.id,
          label: i.identifier,
          type: "issue" as const,
          description: i.title,
        }));

      return [...allItem, ...memberItems, ...agentItems, ...issueItems].slice(0, 10);
    },

    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null;
      let popup: HTMLDivElement | null = null;

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          renderer = new ReactRenderer(MentionList, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          });

          popup = document.createElement("div");
          popup.style.position = "fixed";
          popup.style.zIndex = "50";
          popup.appendChild(renderer.element);
          document.body.appendChild(popup);

          updatePosition(popup, props.clientRect);
        },

        onUpdate: (props: SuggestionProps<MentionItem>) => {
          renderer?.updateProps({
            items: props.items,
            command: props.command,
          });
          if (popup) updatePosition(popup, props.clientRect);
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            cleanup();
            return true;
          }
          return renderer?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          cleanup();
        },
      };

      function updatePosition(
        el: HTMLDivElement,
        clientRect: (() => DOMRect | null) | null | undefined,
      ) {
        if (!clientRect) return;
        const virtualEl = {
          getBoundingClientRect: () => clientRect() ?? new DOMRect(),
        };
        computePosition(virtualEl, el, {
          placement: "bottom-start",
          strategy: "fixed",
          middleware: [offset(4), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
        });
      }

      function cleanup() {
        renderer?.destroy();
        renderer = null;
        popup?.remove();
        popup = null;
      }
    },
  };
}
