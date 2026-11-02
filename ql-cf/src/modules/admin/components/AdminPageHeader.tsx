import type { ReactNode } from "react";

export function AdminPageHeader({
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    actions ? <div className="flex justify-end py-2">{actions}</div> : null
  );
}
