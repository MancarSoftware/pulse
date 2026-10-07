"use client";

import { useState } from "react";
import { TrialButton } from "@/components/trial-access";
import { Icon } from "@/components/icon";

export type MarketingPlan = {
  id: string;
  name: string;
  months: number;
  total: string;
  monthly: string;
};

export function MarketingPlans({ plans }: { plans: MarketingPlan[] }) {
  const [selected, setSelected] = useState(plans[0]?.id);
  const plan = plans.find((item) => item.id === selected) ?? plans[0];
  if (!plan)
    return (
      <div className="plan-picker">
        <p>Los planes de pago se publicarán aquí cuando estén disponibles.</p>
        <TrialButton>Probar Gymora gratis</TrialButton>
      </div>
    );
  return (
    <div className="plan-picker">
      <div
        className="plan-options"
        role="group"
        aria-label="Duración de la suscripción"
      >
        {plans.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={plan.id === item.id}
            onClick={() => setSelected(item.id)}
          >
            {item.name}
            <span>{item.months === 1 ? "1 mes" : `${item.months} meses`}</span>
          </button>
        ))}
      </div>
      <div className="plan-summary" aria-live="polite" aria-atomic="true">
        <p>
          <Icon name="check" />
          {plan.name}
        </p>
        <div className="plan-total">
          <strong>{plan.total}</strong>
          <span>
            USD por {plan.months === 1 ? "1 mes" : `${plan.months} meses`}
          </span>
        </div>
        <p className="plan-equivalent">
          {plan.months === 1
            ? "Un mes de acceso al sistema."
            : `${plan.monthly} USD al mes, pagando el período completo.`}
        </p>
      </div>
      <TrialButton className="button plan-start">
        Probar antes de contratar <Icon name="arrow" />
      </TrialButton>
      <p className="plan-picker-note">
        La prueba no genera un cobro ni contrata este plan. Podrás elegir tu
        suscripción desde tu cuenta.
      </p>
    </div>
  );
}
