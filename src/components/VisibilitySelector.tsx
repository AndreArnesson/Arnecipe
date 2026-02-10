import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Lock, Users, Globe } from "lucide-react";

interface GroupOption {
  id: string;
  name: string;
}

interface VisibilitySelectorProps {
  visibility: string;
  onVisibilityChange: (visibility: string) => void;
  selectedGroupIds: string[];
  onGroupsChange: (groupIds: string[]) => void;
}

export function VisibilitySelector({
  visibility,
  onVisibilityChange,
  selectedGroupIds,
  onGroupsChange,
}: VisibilitySelectorProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupOption[]>([]);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!user) return;

      const { data: memberRows } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (!memberRows || memberRows.length === 0) return;

      const groupIds = memberRows.map((r) => r.group_id);
      const { data: groupsData } = await supabase
        .from("groups")
        .select("id, name")
        .in("id", groupIds);

      if (groupsData) {
        setGroups(groupsData);
      }
    };

    fetchGroups();
  }, [user]);

  const handleGroupToggle = (groupId: string, checked: boolean) => {
    if (checked) {
      onGroupsChange([...selectedGroupIds, groupId]);
    } else {
      onGroupsChange(selectedGroupIds.filter((id) => id !== groupId));
    }
  };

  const getVisibilityIcon = () => {
    switch (visibility) {
      case "private": return <Lock className="h-4 w-4" />;
      case "group": return <Users className="h-4 w-4" />;
      case "public": return <Globe className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          {getVisibilityIcon()}
          {t("visibility.label")}
        </Label>
        <Select value={visibility} onValueChange={onVisibilityChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">
              <span className="flex items-center gap-2">
                <Lock className="h-3 w-3" />
                {t("visibility.private")}
              </span>
            </SelectItem>
            <SelectItem value="group">
              <span className="flex items-center gap-2">
                <Users className="h-3 w-3" />
                {t("visibility.group")}
              </span>
            </SelectItem>
            <SelectItem value="public">
              <span className="flex items-center gap-2">
                <Globe className="h-3 w-3" />
                {t("visibility.public")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {visibility === "private" && t("visibility.privateHint")}
          {visibility === "group" && t("visibility.groupHint")}
          {visibility === "public" && t("visibility.publicHint")}
        </p>
      </div>

      {visibility === "group" && groups.length > 0 && (
        <div className="space-y-2 pl-1">
          <Label className="text-sm">{t("visibility.selectGroups")}</Label>
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.id} className="flex items-center gap-2">
                <Checkbox
                  id={`group-${group.id}`}
                  checked={selectedGroupIds.includes(group.id)}
                  onCheckedChange={(checked) =>
                    handleGroupToggle(group.id, checked === true)
                  }
                />
                <label
                  htmlFor={`group-${group.id}`}
                  className="text-sm cursor-pointer"
                >
                  {group.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
