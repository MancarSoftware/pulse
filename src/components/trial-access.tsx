"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AuthForm } from "@/components/auth-form";
import { Icon } from "@/components/icon";

const TrialContext = createContext<((trigger: HTMLElement) => void) | null>(
  null,
);

export function TrialAccess({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  return (
    <TrialContext.Provider
      value={(element) => {
        trigger.current = element;
        setOpen(true);
      }}
    >
      <div className="marketing">{children}</div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="trial-overlay" />
          <Dialog.Content
            ref={content}
            className="trial-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              content.current
                ?.querySelector<HTMLInputElement>('input[name="name"]')
                ?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
          >
            <Dialog.Title>Crea tu cuenta de Gymora</Dialog.Title>
            <Dialog.Description>
              Prueba privada de dos días. Sin tarjeta ni cobro automático al
              terminar.
            </Dialog.Description>
            <Dialog.Close className="trial-close" aria-label="Cerrar registro">
              <Icon name="close" />
            </Dialog.Close>
            <AuthForm register registerLabel="Empezar mi prueba gratuita" />
            <p className="trial-note">
              Después configurarás tu gimnasio. Desde ese momento tienes 48
              horas de acceso. Al activar un plan, continúas con tus mismos
              datos.
            </p>
            <p className="trial-login">
              ¿Ya tienes una cuenta? <Link href="/login">Inicia sesión</Link>
            </p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </TrialContext.Provider>
  );
}

export function TrialButton({
  children,
  className = "button",
}: {
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(TrialContext);
  return (
    <Link
      href="/register"
      className={className}
      aria-haspopup={open ? "dialog" : undefined}
      onClick={(event) => {
        if (
          !open ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        open(event.currentTarget);
      }}
    >
      {children}
    </Link>
  );
}
