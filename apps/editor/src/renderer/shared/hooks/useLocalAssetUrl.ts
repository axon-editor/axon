import { useEffect, useState } from "react";

export function useLocalAssetUrl(filePath: string | null | undefined) {
  const [assetUrl, setAssetUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (!filePath) {
      setAssetUrl("");
      return () => {
        active = false;
      };
    }

    setAssetUrl("");
    void window.axon
      .getLocalAssetUrl(filePath)
      .then((url) => {
        if (active) setAssetUrl(url);
      })
      .catch((error) => {
        if (active) setAssetUrl("");
        console.error("failed to authorize local asset:", error);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  return assetUrl;
}
