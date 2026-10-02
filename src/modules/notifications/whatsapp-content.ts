import { formatDate } from "@/shared/dates";
export function ecuadorWhatsAppPhone(phone: string) {
  return /^09[0-9]{8}$/.test(phone) ? `593${phone.slice(1)}` : null;
}
export function membershipMessage(input: {
  kind: string;
  firstName: string;
  organizationName: string;
  planName: string;
  startAt: Date;
  endAt: Date;
  services: string[];
}) {
  const parameters = [
    input.firstName,
    input.organizationName,
    input.planName,
    formatDate(input.startAt),
    formatDate(new Date(input.endAt.getTime() - 1)),
    input.services.join(", "),
  ];
  const text = `${input.kind === "WELCOME" ? "¡Bienvenido/a" : "¡Gracias por renovar"}, ${parameters[0]}!\n${parameters[1]}\nPlan: ${parameters[2]}\nDesde ${parameters[3]} hasta ${parameters[4]}, inclusive.\nServicios: ${parameters[5]}.\nTu QR permite un ingreso por día mientras la membresía esté vigente. Conserva tu QR para presentarlo en recepción.`;
  return { parameters, text };
}
