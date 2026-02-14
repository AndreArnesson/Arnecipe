import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MonitorSmartphone, MonitorOff } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export function WakeLockButton() {
  const { t } = useLanguage();
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isSupported] = useState(() => "wakeLock" in navigator);

  const requestWakeLock = useCallback(async () => {
    if (!isSupported) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      setWakeLock(lock);
      setIsActive(true);
      lock.addEventListener("release", () => {
        setIsActive(false);
        setWakeLock(null);
      });
    } catch {
      // Wake lock request failed (e.g. low battery)
    }
  }, [isSupported]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      setIsActive(false);
    }
  }, [wakeLock]);

  const toggle = () => {
    if (isActive) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  };

  // Re-acquire on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (isActive && document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, [isActive, requestWakeLock, releaseWakeLock]);

  if (!isSupported) return null;

  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      className="gap-1.5"
      title={t("recipe.keepScreenOn")}
    >
      {isActive ? <MonitorSmartphone className="h-4 w-4" /> : <MonitorOff className="h-4 w-4" />}
      <span className="text-xs">{isActive ? t("recipe.screenOn") : t("recipe.keepScreenOn")}</span>
    </Button>
  );
}
