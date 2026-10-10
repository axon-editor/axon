/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOMPurify from "dompurify";
import { useMemo } from "react";
import { type NotebookCellOutput } from "../../lib/nbformat";

interface Props {
  output: NotebookCellOutput;
}

export default function CellOutputView({ output }: Props) {
  if (output.output_type === "stream") {
    return (
      <pre
        className={`axon-notebook-stream whitespace-pre-wrap break-words px-3 py-1 font-mono text-[12px] leading-[1.5] ${
          output.name === "stderr"
            ? "text-[var(--axon-error-foreground,#e06c75)]"
            : "text-[var(--axon-editor-foreground)]"
        }`}
      >
        {output.text.replace(/\n$/, "")}
      </pre>
    );
  }

  if (output.output_type === "error") {
    const traceback = output.traceback.join("\n") || output.evalue;
    return (
      <pre className="axon-notebook-error whitespace-pre-wrap break-words px-3 py-1 font-mono text-[12px] leading-[1.5] text-[var(--axon-error-foreground,#e06c75)]">
        {traceback}
      </pre>
    );
  }

  return <RichOutput output={output} />;
}

// RichOutput picks the most faithful representation the kernel offered. Images
// win over HTML because a plotting library often sends both and the image is the
// real result; HTML is only trusted after DOMPurify sanitizes it, since notebook
// output is arbitrary code the kernel chose to emit.
function RichOutput({
  output,
}: {
  output: Extract<NotebookCellOutput, { data: Record<string, string> }>;
}) {
  const { data } = output;
  const sanitizedHtml = useMemo(() => {
    if (!data["text/html"]) return null;
    return DOMPurify.sanitize(data["text/html"], {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allowfullscreen", "frameborder"],
    });
  }, [data]);

  if (data["image/png"]) {
    return (
      <DocumentImage
        src={`data:image/png;base64,${data["image/png"].replace(/\n/g, "")}`}
      />
    );
  }
  if (data["image/jpeg"]) {
    return (
      <DocumentImage
        src={`data:image/jpeg;base64,${data["image/jpeg"].replace(/\n/g, "")}`}
      />
    );
  }
  if (data["image/svg+xml"]) {
    return (
      <DocumentImage
        src={`data:image/svg+xml;utf8,${encodeURIComponent(data["image/svg+xml"])}`}
      />
    );
  }
  if (sanitizedHtml) {
    return (
      <div
        className="axon-notebook-html px-3 py-1 text-[12px]"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }
  if (data["application/json"]) {
    return (
      <pre className="axon-notebook-result whitespace-pre-wrap break-words px-3 py-1 font-mono text-[12px] leading-[1.5] text-[var(--axon-editor-foreground)] opacity-90">
        {data["application/json"].replace(/\n$/, "")}
      </pre>
    );
  }
  if (data["text/plain"]) {
    return (
      <pre className="axon-notebook-result whitespace-pre-wrap break-words px-3 py-1 font-mono text-[12px] leading-[1.5] text-[var(--axon-editor-foreground)] opacity-90">
        {data["text/plain"].replace(/\n$/, "")}
      </pre>
    );
  }
  return null;
}

function DocumentImage({ src }: { src: string }) {
  return (
    <div className="px-3 py-1">
      <img
        src={src}
        alt="Notebook output"
        className="max-w-full rounded border border-[var(--axon-panel-border)]"
      />
    </div>
  );
}
