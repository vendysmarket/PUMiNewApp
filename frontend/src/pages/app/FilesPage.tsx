import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Copy, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmoriaFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

const STORAGE_KEY = "emoria_files";

const FilesPage = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [files, setFiles] = useState<EmoriaFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EmoriaFile | null>(null);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);

  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");

  // --- Load files once + handle ?open= ---
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    let parsed: EmoriaFile[] = [];
    try {
      parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) parsed = [];
    } catch {
      parsed = [];
    }

    setFiles(parsed);

    const openId = searchParams.get("open");
    if (openId) {
      const fileToOpen = parsed.find((f) => f.id === openId);
      if (fileToOpen) {
        setSelectedFile(fileToOpen);
        searchParams.delete("open");
        setSearchParams(searchParams, { replace: true });
        return;
      }
    }

    if (parsed.length > 0) setSelectedFile(parsed[0]);
  }, [searchParams, setSearchParams]);

  // --- focus rename input ---
  useEffect(() => {
    if (editingFileId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFileId]);

  const generateDefaultName = () => {
    const now = new Date();
    return `emoria_note_${now.getTime()}.txt`;
  };

  const openNewModal = () => {
    setNewFileName(generateDefaultName());
    setNewFileContent("");
    setIsNewModalOpen(true);
  };

  const persist = (next: EmoriaFile[]) => {
    setFiles(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleSaveNewFile = () => {
    if (!newFileName.trim()) return;

    const newFile: EmoriaFile = {
      id: crypto.randomUUID(),
      name: newFileName.trim(),
      content: newFileContent ?? "",
      createdAt: new Date().toISOString(),
    };

    const updatedFiles = [...files, newFile];
    persist(updatedFiles);

    setSelectedFile(newFile);
    setIsNewModalOpen(false);
    toast({ description: "Fájl mentve" });
  };

  const handleCopyContent = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile.content || "");
    toast({ description: "Tartalom kimásolva" });
  };

  const handleDeleteFile = () => {
    if (!deleteFileId) return;

    const updated = files.filter((f) => f.id !== deleteFileId);
    persist(updated);

    // if deleted selected, pick first remaining
    if (selectedFile?.id === deleteFileId) {
      setSelectedFile(updated.length ? updated[0] : null);
    }

    setDeleteFileId(null);
    toast({ description: "Fájl törölve" });
  };

  const formatShortDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleStartRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setEditingFileId(id);
    setEditingName(name);
  };

  const handleSaveRename = () => {
    if (!editingFileId || !editingName.trim()) return;

    const updated = files.map((f) => (f.id === editingFileId ? { ...f, name: editingName.trim() } : f));
    persist(updated);

    if (selectedFile?.id === editingFileId) {
      setSelectedFile({ ...selectedFile, name: editingName.trim() });
    }

    setEditingFileId(null);
    setEditingName("");
  };

  const handleCancelRename = () => {
    setEditingFileId(null);
    setEditingName("");
  };

  const markdownComponents = useMemo(
    () => ({
      h1: (props: any) => <h1 className="text-lg font-medium text-foreground/90 mt-2 mb-3" {...props} />,
      h2: (props: any) => <h2 className="text-base font-medium text-foreground/90 mt-4 mb-2" {...props} />,
      h3: (props: any) => <h3 className="text-sm font-medium text-foreground/90 mt-3 mb-2" {...props} />,
      p: (props: any) => <p className="text-foreground/70 leading-relaxed my-2" {...props} />,
      strong: (props: any) => <strong className="text-foreground/85 font-semibold" {...props} />,
      em: (props: any) => <em className="text-foreground/75 italic" {...props} />,
      ul: (props: any) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
      ol: (props: any) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
      li: (props: any) => <li className="text-foreground/70 leading-relaxed" {...props} />,
      blockquote: (props: any) => (
        <blockquote className="border-l border-foreground/20 pl-4 my-3 text-foreground/65" {...props} />
      ),
      code: ({ inline, ...props }: any) =>
        inline ? (
          <code className="px-1 py-0.5 rounded bg-foreground/10 text-foreground/80" {...props} />
        ) : (
          <pre className="p-3 rounded-xl bg-foreground/10 overflow-x-auto">
            <code className="text-foreground/80 text-xs" {...props} />
          </pre>
        ),
      a: (props: any) => (
        <a
          className="underline text-foreground/80 hover:text-foreground/95"
          target="_blank"
          rel="noreferrer"
          {...props}
        />
      ),
    }),
    [],
  );

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <h1 className="text-lg md:text-xl font-light text-foreground/80">Fájlok</h1>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border border-foreground/20 text-foreground/60 text-xs md:text-sm font-light hover:border-foreground/40 hover:text-foreground/80"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Új fájl</span>
        </button>
      </div>

      {/* Mobile: Vertical stack layout */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-[calc(100%-4rem)]">
        {/* LEFT LIST - Full width on mobile, fixed width on desktop */}
        <div className="w-full md:w-64 border border-foreground/10 rounded-2xl overflow-hidden shrink-0 max-h-48 md:max-h-none md:h-full">
          <div className="h-full overflow-y-auto">
            {files.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[80px] text-foreground/30 text-sm">
                Nincs fájl
              </div>
            ) : (
              files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => editingFileId !== file.id && setSelectedFile(file)}
                  className={cn(
                    "px-4 py-3 border-b border-foreground/5 group cursor-pointer",
                    selectedFile?.id === file.id
                      ? "bg-foreground/5 text-foreground/90"
                      : "text-foreground/50 hover:bg-foreground/5",
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div className="min-w-0 flex-1">
                      {editingFileId === file.id ? (
                        <Input
                          ref={editInputRef}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRename();
                            if (e.key === "Escape") handleCancelRename();
                          }}
                          onBlur={handleSaveRename}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <div className="text-sm truncate">{file.name}</div>
                      )}
                      <div className="text-xs text-foreground/30">{formatShortDate(file.createdAt)}</div>
                    </div>

                    {editingFileId !== file.id && (
                      <div className="opacity-100 md:opacity-0 group-hover:opacity-100 flex gap-3 shrink-0 ml-2">
                        <button 
                          onClick={(e) => handleStartRename(e, file.id, file.name)}
                          className="p-1"
                        >
                          <Pencil className="w-4 h-4 md:w-3 md:h-3 text-foreground/40" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteFileId(file.id);
                          }}
                          className="p-1"
                        >
                          <Trash2 className="w-4 h-4 md:w-3 md:h-3 text-foreground/40" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PREVIEW - Takes remaining space */}
        <div className="flex-1 border border-foreground/10 rounded-2xl overflow-hidden min-h-0 flex flex-col">
          {selectedFile ? (
            <>
              <div className="px-4 md:px-6 py-3 md:py-4 border-b border-foreground/10 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs md:text-sm text-foreground/70 truncate">{selectedFile.name}</span>
                <div className="flex gap-3">
                  <button onClick={handleCopyContent} title="Másolás" className="p-1">
                    <Copy className="w-4 h-4 text-foreground/40" />
                  </button>
                  <button onClick={() => setDeleteFileId(selectedFile.id)} title="Törlés" className="p-1">
                    <Trash2 className="w-4 h-4 text-foreground/40" />
                  </button>
                </div>
              </div>

              {/* SCROLLABLE, FORMATTED PREVIEW */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                    {selectedFile.content?.trim() ? selectedFile.content : "Üres fájl"}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-foreground/30 text-sm">Válassz egy fájlt</div>
          )}
        </div>
      </div>

      {/* NEW FILE MODAL */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új fájl</DialogTitle>
          </DialogHeader>

          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <textarea
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            rows={10}
            className="w-full border p-2 rounded mt-3"
            placeholder="Írj ide…"
          />

          <button onClick={handleSaveNewFile} className="mt-3 px-4 py-2 rounded border">
            Mentés
          </button>
        </DialogContent>
      </Dialog>

      {/* DELETE MODAL */}
      <AlertDialog open={!!deleteFileId} onOpenChange={() => setDeleteFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fájl törlése?</AlertDialogTitle>
            <AlertDialogDescription>Ez a művelet nem visszavonható.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile}>Törlés</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FilesPage;
