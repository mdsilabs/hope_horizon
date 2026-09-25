"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ isOpen, onClose, title, description, children, size = "md" }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "relative w-full rounded-2xl bg-white p-6 shadow-popover",
              SIZE_CLASSES[size]
            )}
          >
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-surface-muted hover:text-slate-600 focus-ring"
            >
              <X className="h-5 w-5" />
            </button>
            {title && (
              <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            <div className={cn(title || description ? "mt-4" : "")}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
