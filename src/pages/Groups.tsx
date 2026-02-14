import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChefHat, LogOut, Plus, Users, Mail, Loader2, ArrowLeft, Trash2, UserMinus, Crown, Check, X } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { toast } from "sonner";

interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members: GroupMember[];
  invites: GroupInvite[];
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: { display_name: string | null };
}

interface GroupInvite {
  id: string;
  invited_email: string;
  invited_by: string;
  status: string;
  created_at: string;
}

interface PendingInvite {
  id: string;
  group_id: string;
  invited_email: string;
  status: string;
  created_at: string;
  group_name?: string;
}

export default function Groups() {
  const { user, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [leaveGroupId, setLeaveGroupId] = useState<string | null>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const fetchGroups = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch groups where user is a member
      const { data: memberRows, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (memberError) {
        console.error("Error fetching group memberships:", memberError);
        toast.error(t("groups.failedToLoad"));
        return;
      }

      const groupIds = (memberRows || []).map((r) => r.group_id);

      if (groupIds.length === 0) {
        setGroups([]);
        await fetchPendingInvites();
        setIsLoading(false);
        return;
      }

      // Fetch groups
      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: false });

      if (groupsError) {
        console.error("Error fetching groups:", groupsError);
        toast.error(t("groups.failedToLoad"));
        return;
      }

      // Fetch members for all groups
      const { data: allMembers } = await supabase
        .from("group_members")
        .select("*")
        .in("group_id", groupIds);

      // Fetch profiles for all members
      const memberUserIds = [...new Set((allMembers || []).map((m) => m.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", memberUserIds);

      const profilesMap = new Map(
        (profilesData || []).map((p) => [p.user_id, p])
      );

      // Fetch pending invites for all groups
      const { data: allInvites } = await supabase
        .from("group_invites")
        .select("*")
        .in("group_id", groupIds)
        .eq("status", "pending");

      // Build groups with members and invites
      const enrichedGroups: Group[] = (groupsData || []).map((group) => ({
        ...group,
        members: (allMembers || [])
          .filter((m) => m.group_id === group.id)
          .map((m) => ({
            ...m,
            profile: profilesMap.get(m.user_id) as { display_name: string | null } | undefined,
          })),
        invites: (allInvites || []).filter((inv) => inv.group_id === group.id),
      }));

      setGroups(enrichedGroups);
      await fetchPendingInvites();
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error(t("groups.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingInvites = async () => {
    if (!user?.email) return;

    const { data: invites } = await supabase
      .from("group_invites")
      .select("*")
      .eq("invited_email", user.email)
      .eq("status", "pending");

    if (invites && invites.length > 0) {
      // Fetch group names for invites
      const inviteGroupIds = invites.map((inv) => inv.group_id);
      const { data: inviteGroups } = await supabase
        .from("groups")
        .select("id, name")
        .in("id", inviteGroupIds);

      const groupNameMap = new Map(
        (inviteGroups || []).map((g) => [g.id, g.name])
      );

      setPendingInvites(
        invites.map((inv) => ({
          ...inv,
          group_name: groupNameMap.get(inv.group_id),
        }))
      );
    } else {
      setPendingInvites([]);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setIsCreating(true);

    try {
      // Create the group
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .insert({ name: newGroupName.trim(), created_by: user.id })
        .select()
        .single();

      if (groupError) {
        console.error("Error creating group:", groupError);
        toast.error(t("groups.failedToCreate"));
        return;
      }

      // Add creator as owner member
      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: groupData.id, user_id: user.id, role: "owner" });

      if (memberError) {
        console.error("Error adding owner:", memberError);
        toast.error(t("groups.failedToCreate"));
        return;
      }

      toast.success(t("groups.groupCreated"));
      setNewGroupName("");
      setCreateOpen(false);
      fetchGroups();
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error(t("groups.failedToCreate"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !inviteGroupId || !user) return;
    setIsSendingInvite(true);

    try {
      const { error } = await supabase.from("group_invites").insert({
        group_id: inviteGroupId,
        invited_email: inviteEmail.trim().toLowerCase(),
        invited_by: user.id,
      });

      if (error) {
        console.error("Error sending invite:", error);
        toast.error(t("groups.failedToInvite"));
        return;
      }

      toast.success(t("groups.inviteSent"));
      setInviteEmail("");
      setInviteGroupId(null);
      fetchGroups();
    } catch (error) {
      console.error("Error sending invite:", error);
      toast.error(t("groups.failedToInvite"));
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleAcceptInvite = async (invite: PendingInvite) => {
    if (!user) return;

    try {
      // Update invite status
      const { error: updateError } = await supabase
        .from("group_invites")
        .update({ status: "accepted" })
        .eq("id", invite.id);

      if (updateError) {
        console.error("Error accepting invite:", updateError);
        toast.error(t("groups.failedToRespond"));
        return;
      }

      // Add user to group
      const { error: memberError } = await supabase
        .from("group_members")
        .insert({ group_id: invite.group_id, user_id: user.id, role: "member" });

      if (memberError) {
        console.error("Error joining group:", memberError);
        toast.error(t("groups.failedToRespond"));
        return;
      }

      toast.success(t("groups.inviteAccepted"));
      fetchGroups();
    } catch (error) {
      console.error("Error accepting invite:", error);
      toast.error(t("groups.failedToRespond"));
    }
  };

  const handleDeclineInvite = async (invite: PendingInvite) => {
    try {
      const { error } = await supabase
        .from("group_invites")
        .update({ status: "declined" })
        .eq("id", invite.id);

      if (error) {
        console.error("Error declining invite:", error);
        toast.error(t("groups.failedToRespond"));
        return;
      }

      toast.success(t("groups.inviteDeclined"));
      fetchGroups();
    } catch (error) {
      console.error("Error declining invite:", error);
      toast.error(t("groups.failedToRespond"));
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!user) return;

    // Check if user is owner
    const group = groups.find((g) => g.id === groupId);
    const isOwner = group?.members.some(
      (m) => m.user_id === user.id && m.role === "owner"
    );
    const otherMembers = group?.members.filter((m) => m.user_id !== user.id) || [];

    if (isOwner && otherMembers.length > 0) {
      // Owner must transfer ownership first
      setLeaveGroupId(groupId);
      setNewOwnerId("");
      return;
    }

    // If owner and no other members, just delete the group
    if (isOwner && otherMembers.length === 0) {
      await handleDeleteGroup(groupId);
      return;
    }

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error leaving group:", error);
        return;
      }

      toast.success(t("groups.leftGroup"));
      fetchGroups();
    } catch (error) {
      console.error("Error leaving group:", error);
    }
  };

  const handleTransferAndLeave = async () => {
    if (!user || !leaveGroupId || !newOwnerId) return;

    try {
      // Transfer ownership: update new owner's role
      const { error: updateError } = await supabase
        .from("group_members")
        .update({ role: "owner" })
        .eq("group_id", leaveGroupId)
        .eq("user_id", newOwnerId);

      if (updateError) {
        console.error("Error transferring ownership:", updateError);
        toast.error(t("groups.failedToRespond"));
        return;
      }

      // Update groups table created_by
      const { error: groupUpdateError } = await supabase
        .from("groups")
        .update({ created_by: newOwnerId })
        .eq("id", leaveGroupId);

      if (groupUpdateError) {
        console.error("Error updating group owner:", groupUpdateError);
      }

      // Remove self from group
      const { error: deleteError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", leaveGroupId)
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Error leaving group:", deleteError);
        return;
      }

      toast.success(t("groups.ownershipTransferred"));
      setLeaveGroupId(null);
      setNewOwnerId("");
      fetchGroups();
    } catch (error) {
      console.error("Error transferring and leaving:", error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from("groups")
        .delete()
        .eq("id", groupId);

      if (error) {
        console.error("Error deleting group:", error);
        return;
      }

      toast.success(t("groups.groupDeleted"));
      fetchGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                <ChefHat className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground">
                  {t("groups.title")}
                </h1>
                <p className="text-xs text-muted-foreground">{t("groups.subtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                {t("groups.backToRecipes")}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} title={t("auth.signOut")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Pending invites for user */}
        {pendingInvites.length > 0 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-semibold mb-4">{t("groups.pendingInvitesForYou")}</h2>
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <Card key={invite.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{invite.group_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invite.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAcceptInvite(invite)} className="gap-1">
                        <Check className="h-3 w-3" />
                        {t("groups.accept")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeclineInvite(invite)} className="gap-1">
                        <X className="h-3 w-3" />
                        {t("groups.decline")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Create group button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-semibold">{t("groups.myGroups")}</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("groups.createGroup")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("groups.createGroup")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("groups.groupName")}</Label>
                  <Input
                    placeholder={t("groups.groupNamePlaceholder")}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    {t("groups.cancel")}
                  </Button>
                  <Button onClick={handleCreateGroup} disabled={isCreating || !newGroupName.trim()}>
                    {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("groups.create")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Groups list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              {t("groups.noGroups")}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t("groups.noGroupsDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const isOwner = group.members.some(
                (m) => m.user_id === user.id && m.role === "owner"
              );

              return (
                <Card key={group.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="font-display text-lg">{group.name}</CardTitle>
                        <CardDescription>
                          {group.members.length} {t("groups.members").toLowerCase()}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {isOwner ? (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLeaveGroup(group.id)}
                              className="gap-1"
                            >
                              <UserMinus className="h-3 w-3" />
                              {t("groups.leaveGroup")}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="gap-1"
                            >
                              <Trash2 className="h-3 w-3" />
                              {t("groups.deleteGroup")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLeaveGroup(group.id)}
                            className="gap-1"
                          >
                            <UserMinus className="h-3 w-3" />
                            {t("groups.leaveGroup")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Members */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">{t("groups.members")}</h4>
                      <div className="flex flex-wrap gap-2">
                        {group.members.map((member) => (
                          <Badge
                            key={member.id}
                            variant={member.role === "owner" ? "default" : "secondary"}
                            className="gap-1"
                          >
                            {member.role === "owner" && <Crown className="h-3 w-3" />}
                            {member.profile?.display_name || t("groups.member")}
                            <span className="text-xs opacity-70">
                              ({member.role === "owner" ? t("groups.owner") : t("groups.member")})
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Pending invites for this group */}
                    {group.invites.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium mb-2">{t("groups.pendingInvites")}</h4>
                        <div className="flex flex-wrap gap-2">
                          {group.invites.map((invite) => (
                            <Badge key={invite.id} variant="outline" className="gap-1">
                              <Mail className="h-3 w-3" />
                              {invite.invited_email}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Invite form (for owners) */}
                    {isOwner && (
                      <div className="pt-3 border-t">
                        {inviteGroupId === group.id ? (
                          <div className="flex gap-2">
                            <Input
                              type="email"
                              placeholder={t("groups.inviteEmailPlaceholder")}
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              onClick={handleSendInvite}
                              disabled={isSendingInvite || !inviteEmail.trim()}
                            >
                              {isSendingInvite && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                              {t("groups.sendInvite")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setInviteGroupId(null);
                                setInviteEmail("");
                              }}
                            >
                              {t("groups.cancel")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInviteGroupId(group.id)}
                            className="gap-1"
                          >
                            <Mail className="h-3 w-3" />
                            {t("groups.invite")}
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {/* Transfer ownership dialog */}
        <Dialog open={!!leaveGroupId} onOpenChange={(open) => { if (!open) { setLeaveGroupId(null); setNewOwnerId(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("groups.transferOwnershipFirst")}</DialogTitle>
              <DialogDescription>{t("groups.transferOwnershipDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("groups.selectNewOwner")}</Label>
                <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("groups.selectNewOwner")} />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveGroupId && groups
                      .find((g) => g.id === leaveGroupId)
                      ?.members.filter((m) => m.user_id !== user.id)
                      .map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profile?.display_name || t("groups.member")}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setLeaveGroupId(null); setNewOwnerId(""); }}>
                  {t("groups.cancel")}
                </Button>
                <Button onClick={handleTransferAndLeave} disabled={!newOwnerId}>
                  {t("groups.transferAndLeave")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
