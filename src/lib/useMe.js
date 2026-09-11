"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

/** Current app user (credits, saved provider keys) with a manual refresh. */
export function useMe() {
  const { isLoaded, isSignedIn } = useUser();
  const [me, setMe] = useState(null);

  const refresh = useCallback(() => {
    if (!isSignedIn) {
      return Promise.resolve(null).then((v) => {
        setMe(null);
        return v;
      });
    }
    return fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMe(data);
        return data;
      })
      .catch(() => null);
  }, [isSignedIn]);

  useEffect(() => {
    if (isLoaded) refresh();
  }, [isLoaded, refresh]);

  return { me, refresh, isLoaded, isSignedIn };
}
