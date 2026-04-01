"use client";

import { useState } from "react";
import { Download, File, FileText, FileArchive } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/shared/types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string) {
  if (contentType === "application/pdf") return FileText;
  if (contentType.includes("zip") || contentType.includes("archive"))
    return FileArchive;
  return File;
}

function ImageThumbnail({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <img
                  src={attachment.download_url}
                  alt={attachment.filename}
                  className="h-20 w-20 object-cover rounded-md border border-border hover:border-primary cursor-pointer transition-colors"
                  loading="lazy"
                />
              }
            />
          }
        />
        <TooltipContent>{attachment.filename}</TooltipContent>
      </Tooltip>
      <DialogContent
        className="max-w-4xl p-2"
        showCloseButton={false}
      >
        <img
          src={attachment.download_url}
          alt={attachment.filename}
          className="max-w-full max-h-[80vh] object-contain rounded-md"
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-muted-foreground truncate">
            {attachment.filename}
          </span>
          <a
            href={attachment.download_url}
            download
            className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileChip({ attachment }: { attachment: Attachment }) {
  const Icon = fileIcon(attachment.content_type);
  return (
    <a
      href={attachment.download_url}
      download
      className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate max-w-[200px]">{attachment.filename}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatFileSize(attachment.size_bytes)}
      </span>
    </a>
  );
}

interface AttachmentListProps {
  attachments: Attachment[];
  /** Markdown content — images whose URL appears in this text are hidden to avoid duplication. */
  content?: string;
  className?: string;
}

export function AttachmentList({ attachments, content, className }: AttachmentListProps) {
  if (!attachments?.length) return null;

  const images = attachments.filter(
    (a) => a.content_type.startsWith("image/") && !(content && content.includes(a.url)),
  );
  const files = attachments.filter((a) => !a.content_type.startsWith("image/"));

  if (images.length === 0 && files.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((att) => (
            <ImageThumbnail key={att.id} attachment={att} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((att) => (
            <FileChip key={att.id} attachment={att} />
          ))}
        </div>
      )}
    </div>
  );
}
