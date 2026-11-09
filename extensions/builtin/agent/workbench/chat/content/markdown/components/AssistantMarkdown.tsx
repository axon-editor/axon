/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import ReactMarkdown from "react-markdown";
import { createMarkdownComponents } from "../model/createMarkdownComponents";
import { REMARK_PLUGINS } from "../model/remarkPlugins";

interface Props {
  content: string;
  onOpenLink?: (href: string) => void;
}

function AssistantMarkdown({ content, onOpenLink }: Props) {
  // The link handler must stay stable for the memoized component map, so it
  // reads the latest callback from a ref instead of depending on it.
  const onOpenLinkRef = useRef(onOpenLink);
  useEffect(() => {
    onOpenLinkRef.current = onOpenLink;
  }, [onOpenLink]);

  // In-page anchors stay in the message. Every other link goes through the
  // workbench so a dev-server URL cannot navigate the Electron renderer away
  // from the editor when the agent points at a workspace file.
  const handleLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (!href || href.startsWith("#")) return;
      event.preventDefault();

      const openLink = onOpenLinkRef.current;
      if (openLink) {
        openLink(href);
        return;
      }

      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        void window.axon?.openExternalLink(href);
      }
    },
    [],
  );

  const components = useMemo(
    () => createMarkdownComponents(handleLinkClick),
    [handleLinkClick],
  );

  return (
    <div className="text-[13px] leading-5 text-[var(--axon-editor-foreground)]">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(AssistantMarkdown);
