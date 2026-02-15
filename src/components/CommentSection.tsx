import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Trash2, Pencil, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profiles?: { display_name: string | null };
}

interface CommentSectionProps {
  recipeId: string;
}

export function CommentSection({ recipeId }: CommentSectionProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const fetchComments = async () => {
    const { data } = await supabase
      .from("recipe_comments")
      .select("id, content, user_id, created_at")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });

    if (data) {
      // Fetch profiles for comment authors
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      setComments(data.map(c => ({
        ...c,
        profiles: profileMap.get(c.user_id) || { display_name: null },
      })));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchComments();
  }, [recipeId]);

  const handleSend = async () => {
    if (!newComment.trim() || !user) return;
    setIsSending(true);
    const { error } = await supabase
      .from("recipe_comments")
      .insert({ recipe_id: recipeId, user_id: user.id, content: newComment.trim() });
    if (error) {
      toast.error(t("comments.failedToAdd"));
    } else {
      setNewComment("");
      fetchComments();
    }
    setIsSending(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("recipe_comments").delete().eq("id", id);
    if (error) {
      toast.error(t("comments.failedToDelete"));
    } else {
      setComments(prev => prev.filter(c => c.id !== id));
    }
  };

  const handleEditSave = async () => {
    if (!editContent.trim() || !editingId) return;
    const { error } = await supabase
      .from("recipe_comments")
      .update({ content: editContent.trim() })
      .eq("id", editingId);
    if (error) {
      toast.error(t("comments.failedToUpdate"));
    } else {
      setEditingId(null);
      fetchComments();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold">{t("comments.title")}</h3>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("comments.noComments")}</p>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {getInitials(comment.profiles?.display_name ?? null)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.profiles?.display_name || "?"}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
                </div>
                {editingId === comment.id ? (
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={2}
                      className="flex-1 min-h-0"
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" onClick={handleEditSave} className="h-7 w-7">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="h-7 w-7">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                )}
              </div>
              {user?.id === comment.user_id && editingId !== comment.id && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleDelete(comment.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {user && (
        <div className="flex gap-2 pt-2">
          <Textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder={t("comments.placeholder")}
            rows={2}
            className="flex-1 min-h-0"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button size="icon" onClick={handleSend} disabled={isSending || !newComment.trim()}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
