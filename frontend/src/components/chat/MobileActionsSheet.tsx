import { useRef } from "react";
import { Archive, Paperclip, Camera } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVaultClick?: () => void;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const MobileActionsSheet = ({
  open,
  onOpenChange,
  onVaultClick,
  onFileSelect,
}: MobileActionsSheetProps) => {
  const { hasPaidAccess } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleAction = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect?.(e);
    onOpenChange(false);
  };

  const handleVaultClick = () => {
    if (onVaultClick) {
      onVaultClick();
    }
    onOpenChange(false);
  };

  const attachmentItems = [
    {
      icon: Camera,
      label: "Kamera",
      action: handleCameraClick,
      requiresPaid: false,
    },
    {
      icon: Paperclip,
      label: "Fájl csatolása",
      action: handleFileClick,
      requiresPaid: false,
    },
    {
      icon: Archive,
      label: "Csatolás a Tárból",
      action: handleVaultClick,
      requiresPaid: true,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="rounded-t-2xl px-0 pb-8 pt-2 max-h-[50vh]"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileChange}
          className="hidden"
        />
        
        {/* Hidden camera input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Drag handle */}
        <div className="flex justify-center py-2 mb-2">
          <div className="w-10 h-1 rounded-full bg-foreground/20" />
        </div>

        <SheetHeader className="px-6 pb-4 border-b border-foreground/10">
          <SheetTitle className="text-sm font-light tracking-wider text-foreground/70 text-left">
            CSATOLÁS
          </SheetTitle>
        </SheetHeader>

        <div className="py-2">
          {attachmentItems.map((item, index) => {
            const Icon = item.icon;
            const isLocked = item.requiresPaid && !hasPaidAccess;

            return (
              <button
                key={index}
                onClick={() => !isLocked && handleAction(item.action)}
                className={cn(
                  "w-full flex items-center gap-4 px-6 py-4 min-h-[56px] transition-colors",
                  isLocked
                    ? "text-foreground/30 cursor-not-allowed"
                    : "text-foreground/70 active:bg-foreground/5"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm">{item.label}</span>
                {isLocked && (
                  <span className="text-xs text-amber-500/70 ml-auto">Előfizetés szükséges</span>
                )}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileActionsSheet;
