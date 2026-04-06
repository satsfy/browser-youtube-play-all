import { type CategoryKind, type SortKind, YoutubeDOM } from "./youtube-dom";

const CHANNEL_ID_PATTERN = /^UC[\w-]+$/;

function toChannelId(value: unknown): string | undefined {
  return typeof value === "string" && CHANNEL_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function extractChannelIdFromCanonicalUrl(
  canonicalUrl: string | undefined,
): string | undefined {
  const pathSegment = canonicalUrl?.match(/\/channel\/([^/?#]+)/i)?.[1];
  return toChannelId(pathSegment);
}

function extractChannelIdFromCanonicalHtml(html: string): string | undefined {
  const canonicalUrl =
    html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  return extractChannelIdFromCanonicalUrl(canonicalUrl);
}

function normalizeChannelPath(channelUrl: string): string | undefined {
  try {
    const pathname = new URL(channelUrl, window.location.origin).pathname;
    return pathname.replace(/\/(videos|shorts|streams)\/?$/i, "");
  } catch {
    return undefined;
  }
}

function extractChannelIdFromBrowseEndpointHtml(
  html: string,
  channelUrl: string,
): string | undefined {
  const channelPath = normalizeChannelPath(channelUrl);
  const endpointPattern =
    /"browseEndpoint":\{"browseId":"(UC[\w-]+)"(?:,"canonicalBaseUrl":"([^"]+)")?/g;

  const endpointMatches = Array.from(html.matchAll(endpointPattern));
  for (const eachMatch of endpointMatches) {
    const channelId = toChannelId(eachMatch[1]);
    const canonicalBaseUrl = eachMatch[2];
    if (!channelId) {
      continue;
    }
    if (!channelPath || !canonicalBaseUrl) {
      continue;
    }
    if (channelPath === canonicalBaseUrl || channelPath.startsWith(`${canonicalBaseUrl}/`)) {
      return channelId;
    }
  }

  return toChannelId(endpointMatches.at(0)?.[1]);
}

export async function fetchChannelId(channelUrl: string) {
  const res = await fetch(channelUrl);
  const html = await res.text();
  return (
    extractChannelIdFromCanonicalHtml(html) ??
    extractChannelIdFromBrowseEndpointHtml(html, channelUrl)
  );
}

export async function resolveChannelId(
  channelUrl: string,
  withNetworkFallback = true,
) {
  const fromYtCommand = toChannelId((window as any).ytCommand?.browseEndpoint?.browseId);
  if (fromYtCommand) {
    return fromYtCommand;
  }

  const fromCanonicalDom = extractChannelIdFromCanonicalUrl(
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href,
  );
  if (fromCanonicalDom) {
    return fromCanonicalDom;
  }

  const fromYtInitialData = toChannelId(
    (window as any).ytInitialData?.responseContext?.serviceTrackingParams
      ?.find((e: any) => e?.service === "GOOGLE_HELP")
      ?.params?.find((e: any) => e?.key === "browse_id")?.value,
  );
  if (fromYtInitialData) {
    return fromYtInitialData;
  }

  const fromMetadata = toChannelId(
    (window as any).ytInitialData?.metadata?.channelMetadataRenderer?.externalId,
  );
  if (fromMetadata) {
    return fromMetadata;
  }

  const fromInlineHtml = extractChannelIdFromBrowseEndpointHtml(
    document.documentElement.innerHTML,
    channelUrl,
  );
  if (fromInlineHtml) {
    return fromInlineHtml;
  }

  if (withNetworkFallback) {
    try {
      return await fetchChannelId(channelUrl);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function resolvePlaylistPath(
  channelId: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): Promise<string> {
  if (sortKind === "Oldest") {
    const videoId = await getOldestItemId(channelId, categoryKind);
    if (videoId === null) {
      return "";
    }
    return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
  } else {
    return `${resolveFilteredPlaylistUrl(channelId, categoryKind, sortKind)}&playnext=1`;
  }
}

async function getOldestItemId(
  channelId: string,
  categoryKind: CategoryKind,
): Promise<string | null> {
  const playlistUrl = `${resolveFilteredPlaylistUrl(channelId, categoryKind, "Latest")}`;

  const playlistHeader = (await fetchYtInitialData(playlistUrl)).header;
  if (playlistHeader === undefined) {
    return null;
  }

  const videoCount =
    playlistHeader.playlistHeaderRenderer.stats[0].runs[0].text;

  const oldestVideoId = (
    await fetchYtInitialData(`${playlistUrl}&index=${videoCount}&playnext=1`)
  ).currentVideoEndpoint.watchEndpoint.videoId;

  return oldestVideoId;
}

function resolveFilteredPlaylistUrl(
  channelId: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): string {
  const playlistPrefix = (() => {
    switch (true) {
      case categoryKind === "Videos" && sortKind === "Latest":
        return "UULF";
      case categoryKind === "Videos" && sortKind === "Popular":
        return "UULP";
      case categoryKind === "Shorts" && sortKind === "Latest":
        return "UUSH";
      case categoryKind === "Shorts" && sortKind === "Popular":
        return "UUPS";
      case categoryKind === "Streams" && sortKind === "Latest":
        return "UULV";
      case categoryKind === "Streams" && sortKind === "Popular":
        return "UUPV";
      default:
        return "UU";
    }
  })();
  const playlistUrl = `/playlist?list=${playlistPrefix}${channelId.slice(2)}`;
  return playlistUrl;
}

async function fetchYtInitialData(url: string) {
  const htmlRes = await fetch(url);
  const html = await htmlRes.text();
  const ytInitialDataString = html.match(
    YoutubeDOM.isMobile
      ? /var ytInitialData\s*=\s*'([\s\S]*?)';/
      : /var ytInitialData\s*=\s*(\{[\s\S]*?\});/,
  )![1];
  const ytInitialData = JSON.parse(
    YoutubeDOM.isMobile
      ? ytInitialDataString
          .replace(/\\\\\\x22/g, '\\\\\\"')
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          )
      : ytInitialDataString,
  );
  return ytInitialData;
}
