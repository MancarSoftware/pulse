"use client";
import { useState, type InputHTMLAttributes } from "react";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode"
> & { decimal?: boolean; signed?: boolean };
export function NumericInput({
  decimal = false,
  signed = false,
  value,
  defaultValue,
  onChange,
  onBlur,
  min,
  max,
  ...props
}: Props) {
  const [draft, setDraft] = useState(String(defaultValue ?? ""));
  const partial = decimal
    ? /^\d*(?:[.,]\d{0,2})?$/
    : signed
      ? /^-?\d*$/
      : /^\d*$/;
  function validate(input: HTMLInputElement) {
    const number = Number(input.value.replace(",", "."));
    const incomplete = ["", "-", ".", ","].includes(input.value);
    input.setCustomValidity(
      !incomplete &&
        ((min !== undefined && number < Number(min)) ||
          (max !== undefined && number > Number(max)))
        ? `Ingresa un valor${min !== undefined ? ` desde ${min}` : ""}${max !== undefined ? ` hasta ${max}` : ""}.`
        : "",
    );
  }
  return (
    <input
      {...props}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={value ?? draft}
      pattern={
        decimal
          ? "[0-9]{1,10}([.,][0-9]{1,2})?"
          : signed
            ? "-?[0-9]+"
            : "[0-9]+"
      }
      onChange={(event) => {
        if (!partial.test(event.target.value)) return;
        setDraft(event.target.value);
        validate(event.currentTarget);
        onChange?.(event);
      }}
      onBlur={(event) => {
        validate(event.currentTarget);
        onBlur?.(event);
      }}
    />
  );
}
