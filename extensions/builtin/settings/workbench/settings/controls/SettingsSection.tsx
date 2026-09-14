/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Groups a set of settings rows. The modal header already owns the page title,
// so single-section pages pass no heading and this component renders fields
// only, avoiding the same title appearing twice. The stacked Editor page uses
// compact sub-headings to separate typography fom behavior without competing
// with the header for visual hierarchy.
import { type ReactNode } from "react";

interface SettingsSectionProps {
  title?: string;
  description?: string;
  compact?: boolean;
  divider?: boolean;
  children: ReactNode;
}

export default function SettingsSection({
  title,
  description,
  compact = false,
  divider = false,
  children,
}: SettingsSectionProps) {
  const hasHeading = Boolean(title || description);

  return (
    <section className={`space-y-2 ${divider ? "border-t border-[var(--axon-panel-border)] pt-6" : ""}`}>
      {hasHeading &&
        (compact ? (
          <div className="pb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-50">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-55">
                {description}
              </p>
            )}
          </div>
        ) : (
          <div className="pb-4">
            <h2 className="text-[18px] font-semibold text-[var(--axon-editor-foreground)]">{title}</h2>
            {description && (
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-65">
                {description}
              </p>
            )}
          </div>
        ))}
      <div>{children}</div>
    </section>
  );
}