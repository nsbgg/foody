import { useRegisterSW } from "virtual:pwa-register/react";
import { useStore } from "./store.ts";
export function PwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const { pending } = useStore();
  if (!needRefresh) return null;
  return (
    <button
      className="secondary"
      disabled={pending.length > 0}
      onClick={() => void updateServiceWorker(true)}
    >
      {pending.length ? "Update nach Synchronisierung" : "App aktualisieren"}
    </button>
  );
}
