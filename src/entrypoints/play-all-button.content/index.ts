import { defineContentScript } from "#imports";
import type { Channel } from "./channel";
import { YoutubeDOM } from "./youtube-dom";
import { setHooks, YTX_EVENTS, ytxEventEmitter } from "./youtube-hooks";

import "./play-all-button.css";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_end",
  main,
});

function main() {
  setHooks();

  [
    YTX_EVENTS.CATEGORY_ENTER,
    YTX_EVENTS.SORT_CHANGED,
    YTX_EVENTS.SORT_RERENDERED,
  ].forEach((e) => {
    ytxEventEmitter.on(e, async (channel) => {
      await maybeRenderButton(channel);
    });
  });

  // Fallback for environments where the initial load does not emit
  // YouTube's navigation-end event to the content script.
  ytxEventEmitter.emit(YTX_EVENTS.NAVIGATION_END);
}

async function maybeRenderButton(channel: Channel) {
  const sortButtonHolder = await waitForSortButtonHolder();
  if (!sortButtonHolder) {
    return;
  }
  const mountPoint = resolvePlayAllMountPoint(sortButtonHolder);
  if (!mountPoint) {
    return;
  }

  const categoryKind = YoutubeDOM.categoryKind;
  if (!categoryKind) {
    return;
  }

  const sortKind = YoutubeDOM.sortKind ?? "Latest";

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.classList.add(categoryKind.toLowerCase());
  playAllButton.classList.add(sortKind.toLowerCase());
  playAllButton.href = await channel.getPlaylistPath(categoryKind, sortKind);
  playAllButton.textContent = `Play All (${sortKind})`;

  const targetPlayAllButton = document.querySelector(
    `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
  );
  if (!targetPlayAllButton) {
    document.querySelector(".play-all-btn")?.remove();
    mountPoint.appendChild(playAllButton);
  }
}

function resolvePlayAllMountPoint(sortButtonHolder: Element): Element | null {
  const chipBar = YoutubeDOM.sortButtons[0]?.closest("chip-bar-view-model");
  if (chipBar?.parentElement) {
    let row = chipBar.parentElement.querySelector(".play-all-btn-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "play-all-btn-row";
      chipBar.insertAdjacentElement("afterend", row);
    }
    return row;
  }

  return sortButtonHolder;
}

async function waitForSortButtonHolder(
  timeoutMs = 4000,
): Promise<Element | undefined> {
  const existingHolder = YoutubeDOM.sortButtonHolder;
  if (existingHolder) {
    return existingHolder;
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const holder = YoutubeDOM.sortButtonHolder;
      if (holder) {
        observer.disconnect();
        resolve(holder);
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(undefined);
    }, timeoutMs);
  });
}
