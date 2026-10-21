import { useCallback, useEffect, useState } from "react";
import { deleteHdri, duplicateHdri, listHdris, revealHdri, uploadHdri, type LibraryAsset } from "../lib/api";

export function useHdriLibrary() {
  const [hdris, setHdris] = useState<LibraryAsset[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await listHdris();
      setHdris(next);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File): Promise<LibraryAsset | null> => {
      try {
        const uploaded = await uploadHdri(file);
        await refresh();
        return uploaded;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (filename: string) => {
      try {
        await deleteHdri(filename);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [refresh],
  );

  const duplicate = useCallback(
    async (filename: string) => {
      try {
        const hdri = await duplicateHdri(filename);
        await refresh();
        return hdri;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return null;
      }
    },
    [refresh],
  );

  const reveal = useCallback(async (filename: string) => {
    try {
      await revealHdri(filename);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  return { hdris, error, refresh, upload, remove, duplicate, reveal };
}
