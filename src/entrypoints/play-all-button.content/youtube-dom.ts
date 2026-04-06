export class YoutubeDOM {
  public static get isMobile() {
    return window.location.host === "m.youtube.com";
  }

  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get categoryKind(): CategoryKind | null {
    const categorySlug = window.location.pathname
      .split("/")
      .at(-1)!
      .split("?")[0];
    const categoryKind = (() => {
      switch (categorySlug) {
        case "videos":
          return "Videos";
        case "shorts":
          return "Shorts";
        case "streams":
          return "Streams";
        default:
          return null;
      }
    })();
    return categoryKind;
  }

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];

  public static SORT_BUTTON =
    "ytd-browse[page-subtype='channels'] #primary chip-bar-view-model [aria-selected],ytm-browse .tab-content [aria-selected]";

  private static LEGACY_SORT_BUTTON =
    "ytd-browse[page-subtype='channels'] #primary [aria-selected],ytm-browse .tab-content [aria-selected]";

  private static isVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rects = element.getClientRects();
    return rects.length > 0 && rects[0].width > 0 && rects[0].height > 0;
  }

  public static get sortButtons() {
    // sort buttons may not exist when there are not enough videos
    const sortButtons = Array.from(document.querySelectorAll(YoutubeDOM.SORT_BUTTON));
    const visibleSortButtons = sortButtons.filter((e) => YoutubeDOM.isVisible(e));
    if (visibleSortButtons.length > 0) {
      return visibleSortButtons;
    }
    if (sortButtons.length > 0) {
      return sortButtons;
    }
    return Array.from(document.querySelectorAll(YoutubeDOM.LEGACY_SORT_BUTTON));
  }

  public static get sortButtonLineages() {
    return YoutubeDOM.sortButtons.map((e) => {
      const lineage = [];
      let current: Element | null = e;
      while (current) {
        lineage.push(current);
        current = current.parentElement;
      }
      return lineage.reverse();
    });
  }

  public static get sortButtonHolder(): Element | undefined {
    if (YoutubeDOM.sortButtons.length < 3) {
      return undefined;
    }
    const sortButtonLineages = YoutubeDOM.sortButtonLineages.slice(0, 3);
    const sortButtonHolder = sortButtonLineages[0].findLast((e) =>
      sortButtonLineages.slice(1).every((lineage) => lineage.includes(e)),
    );
    return sortButtonHolder;
  }

  public static get sortKind(): SortKind | null {
    const i = Array.from(YoutubeDOM.sortButtonHolder?.children || []).findIndex(
      (eachButtonTree) =>
        eachButtonTree.matches("[aria-selected=true]") ||
        eachButtonTree.querySelector("[aria-selected=true]"),
    );
    const sortKind = (() => {
      switch (i) {
        case 0:
          return "Latest";
        case 1:
          return "Popular";
        case 2:
          return "Oldest";
        default:
          return null;
      }
    })();

    return sortKind;
  }
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
