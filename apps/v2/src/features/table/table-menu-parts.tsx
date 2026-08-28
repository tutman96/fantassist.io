"use client";

import { useId } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";

interface NumberSettingFieldProps {
  readonly label: string;
  readonly suffix: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}

export function NumberSettingField({ label, suffix, value, min, max, step, onChange }: NumberSettingFieldProps) {
  const inputId = useId();

  const commit = (input: HTMLInputElement) => {
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = String(value);
      return;
    }
    onChange(Math.min(max, Math.max(min, input.valueAsNumber)));
  };

  return (
    <Field className="gap-1">
      <FieldLabel
        htmlFor={inputId}
        className="text-[9px] font-medium tracking-[0.1em] text-violet-100/60 uppercase"
      >
        {label}
      </FieldLabel>
      <InputGroup className="h-9 rounded-none border-violet-300/12 bg-black/25 shadow-none focus-within:border-blue-300/35">
        <Input
          key={value}
          id={inputId}
          data-slot="input-group-control"
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-full flex-1 rounded-none border-0 bg-transparent px-2.5 font-mono text-[11px] tracking-normal text-violet-50 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
        <InputGroupAddon align="inline-end" className="pr-2">
          <InputGroupText className="font-mono text-[9px] text-violet-200/50 lowercase">{suffix}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

export function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium tracking-[0.1em] text-violet-100/55 uppercase">{label}</p>
      <p className="mt-1 font-mono text-[10px] text-violet-100/80">{value}</p>
    </div>
  );
}
