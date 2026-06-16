import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";

interface Notification {
  id: string;
  type: string;
  recipe_id: string | null;
  comment_id: string | null;
  actor_id: string;
  read: boolean;
  created_at: string;
  actorName?: string;
  recipeTitle?: string;
}

interface NotificationBellProps {
  onOpenRecipe?: (recipeId: string) => void;
}

export function NotificationBell({ onOpenRecipe }: NotificationBellProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data) return;

    const actorIds = [...new Set(data.map(n => n.actor_id))];
    const recipeIds = [...new Set(data.map(n => n.recipe_id).filter(Boolean))] as string[];

    const [{ data: profiles }, { data: recipes }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", actorIds),
      recipeIds.length > 0
        ? supabase.from("recipes").select("id, title").in("id", recipeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
    const recipeMap = new Map((recipes as { id: string; title: string }[] | null)?.map(r => [r.id, r.title]) || []);

    setNotifications(data.map(n => ({
      ...n,
      actorName: profileMap.get(n.actor_id) || "?",
      recipeTitle: n.recipe_id ? recipeMap.get(n.recipe_id) || "" : "",
    })));
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => fetchNotifications(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.recipe_id && onOpenRecipe) {
      onOpenRecipe(n.recipe_id);
      setOpen(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const notificationText = (n: Notification) => {
    const name = n.actorName || "?";
    const recipe = n.recipeTitle || "";
    if (n.type === "new_recipe")
      return t("notifications.newRecipe").replace("{name}", name).replace("{recipe}", recipe);
    if (n.type === "comment_on_recipe")
      return t("notifications.commentOnRecipe").replace("{name}", name).replace("{recipe}", recipe);
    if (n.type === "reply_to_comment")
      return t("notifications.replyToComment").replace("{name}", name).replace("{recipe}", recipe);
    return "";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title={t("notifications.title")}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm">{t("notifications.title")}</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("notifications.noNotifications")}
            </p>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0 ${!n.read ? "bg-primary/5" : ""}`}
                onClick={() => handleClick(n)}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                  <div className={!n.read ? "" : "pl-4"}>
                    <p className="text-sm leading-snug">{notificationText(n)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
