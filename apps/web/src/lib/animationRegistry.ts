export type AnimationCategory = "cheer" | "trash_talk";
export type AnimationMediaType = "image" | "video";

export interface AnimationAsset {
  id: string;
  category: AnimationCategory;
  mediaType: AnimationMediaType;
  src: string;
  durationMs: number;
}

const DEFAULT_ANIMATION_DURATION_MS = 5000;

const cheerMedia = import.meta.glob<string>(
  "../../../../visual_elements/animations/cheer/*.{mp4,jpg,jpeg,png,webp}",
  {
    eager: true,
    import: "default",
    query: "?url"
  }
);

const trashTalkMedia = import.meta.glob<string>(
  "../../../../visual_elements/animations/trash_talk/*.{mp4,jpg,jpeg,png,webp}",
  {
    eager: true,
    import: "default",
    query: "?url"
  }
);

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function mediaTypeFromPath(path: string): AnimationMediaType | null {
  const extension = filenameFromPath(path).split(".").pop()?.toLowerCase();

  if (extension === "mp4") return "video";
  if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
    return "image";
  }

  return null;
}

function assetsFromGlob(
  category: AnimationCategory,
  entries: Record<string, string>
): AnimationAsset[] {
  return Object.entries(entries)
    .map(([path, src]) => {
      const mediaType = mediaTypeFromPath(path);
      if (!mediaType) return null;

      const filename = filenameFromPath(path);
      const id = `${category}:${filename}`;

      return {
        id,
        category,
        mediaType,
        src,
        durationMs: DEFAULT_ANIMATION_DURATION_MS
      };
    })
    .filter((asset): asset is AnimationAsset => Boolean(asset))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const animationAssets: AnimationAsset[] = [
  ...assetsFromGlob("cheer", cheerMedia),
  ...assetsFromGlob("trash_talk", trashTalkMedia)
];

export function getAnimationAssetsByCategory(
  category: AnimationCategory
): AnimationAsset[] {
  return animationAssets.filter((asset) => asset.category === category);
}

export function pickAnimationAsset(
  category: AnimationCategory
): AnimationAsset | null {
  const assets = getAnimationAssetsByCategory(category);
  if (!assets.length) return null;

  const index = Math.floor(Math.random() * assets.length);
  return assets[index] ?? assets[0];
}

