'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isDanger = variant === 'danger';

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-[400px]">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                isDanger ? 'bg-destructive/10' : 'bg-warning/10'
              )}
            >
              <AlertTriangle
                className={cn(
                  'h-5 w-5',
                  isDanger ? 'text-destructive' : 'text-warning'
                )}
              />
            </div>
            <div>
              <AlertDialogTitle className="text-[15px] font-semibold">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] mt-1 leading-relaxed">
                {message}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              isDanger
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : 'bg-warning text-white hover:bg-warning/90'
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}