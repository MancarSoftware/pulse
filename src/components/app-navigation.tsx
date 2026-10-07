"use client";
import { Brand } from "@/components/brand";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "./icon";

export function AppNavigation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sidebar desktop-sidebar">{children}</aside>
      <div className="mobile-header">
        <span className="wordmark">
          <Brand />
        </span>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="mobile-menu-button">
            <Icon name="menu" /> Menú
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content
              className="sidebar mobile-sidebar"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">Menú principal</Dialog.Title>
              <Dialog.Close className="menu-close" aria-label="Cerrar menú">
                <Icon name="close" />
              </Dialog.Close>
              <div
                className="navigation-content"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a"))
                    setOpen(false);
                }}
              >
                {children}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </>
  );
}
