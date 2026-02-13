import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";

export function PendingInviteBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.email) return;

    const fetchInvites = async () => {
      const { data, error } = await supabase
        .from("group_invites")
        .select("id")
        .eq("invited_email", user.email!)
        .eq("status", "pending");

      if (!error && data) {
        setCount(data.length);
      }
    };

    fetchInvites();
  }, [user?.email]);

  if (count === 0 || dismissed) return null;

  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Mail className="h-4 w-4 text-primary" />
      <AlertDescription className="flex items-center justify-between w-full">
        <span>
          {t("invite.pendingBanner").replace("{count}", String(count))}
        </span>
        <div className="flex items-center gap-2 ml-4">
          <Button size="sm" variant="default" onClick={() => navigate("/groups")}>
            {t("invite.viewInvites")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
