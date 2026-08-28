"use client";

import { useState } from "react";
import { Radio, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEditorScene } from "@/features/scenes/editor-scene-context";

export function DisplayedSceneControl() {
  const editorScene = useEditorScene();
  const [sending, setSending] = useState(false);
  if (!editorScene?.activeSceneKey || editorScene.activeSceneKey === editorScene.displayedSceneKey) return null;

  const display = async () => {
    setSending(true);
    try {
      await editorScene.displayScene();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center">
      <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => void display()} className="h-8 rounded-none border-amber-200/35 bg-[linear-gradient(110deg,rgba(245,158,11,0.12),rgba(253,230,138,0.2),rgba(245,158,11,0.1))] px-3 text-[10px] font-medium tracking-wide text-amber-50 shadow-[0_0_22px_rgba(245,158,11,0.14)] hover:border-amber-100/55 hover:bg-amber-100/18 hover:text-amber-50">
        {sending ? <Radio className="size-3 animate-pulse" aria-hidden="true" /> : <Send className="size-3" aria-hidden="true" />}
        <span className="max-sm:sr-only">{sending ? "Sending to table" : "Display this scene"}</span>
      </Button>
    </div>
  );
}
