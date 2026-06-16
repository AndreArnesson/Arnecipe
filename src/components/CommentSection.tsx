import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Trash2, Pencil, X, Check, CornerDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  user_id: string;
  parent_id: string | null;
  created_at: string;
  profiles?: { display_name: string | null };
  replies?: Comment[];
}

interface CommentSectionProps {
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
}

export function CommentSection({ recipeId, recipeOwnerId, recipeTitle }: CommentSectionProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("recipe_comments")
      .select("id, content, user_id, parent_id, created_at")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: true });

    if (data) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const mapped: Comment[] = data.map(c => ({
        ...c,
        profiles: profileMap.get(c.user_id) || { display_name: null },
        replies: [],
      }));

      // Nest replies under their parent
      const topLevel: Comment[] = [];
      const byId = new Map(mapped.map(c => [c.id, c]));
      for (const c of mapped) {
        if (c.parent_id && byId.has(c.parent_id)) {
          byId.get(c.parent_id)!.replies!.push(c);
        } else {
          topLevel.push(c);
        }
      }
      setComments(topLevel);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchComments();
  }, [recipeId]);

  const createNotification = async (
    recipientId: string,
    type: "comment_on_recipe" | "reply_to_comment",
    commentId: string,
  ) => {
    if (!user || recipientId === user.id) return;
    await supabase.from("notifications").insert({
      user_id: recipientId,
      actor_id: user.id,
      type,
      recipe_id: recipeId,
      comment_id: commentId,
    });
  };

  const handleSend = async () => {
    if (!newComment.trim() || !user) return;
    setIsSending(true);
    const { data, error } = await supabase
      .from("recipe_comments")
      .insert({ recipe_id: recipeId, user_id: user.id, content: newComment.trim() })
      .select("id")
      .single();
    if (error) {
      toast.error(t("comments.failedToAdd"));
    } else {
      setNewComment("");
      if (data) await createNotification(recipeOwnerId, "comment_on_recipe", data.id);
      fetchComments();
    }
    setIsSending(false);
  };

  const handleSendReply = async (parentComment: Comment) => {
    if (!replyContent.trim() || !user || !replyingToId) return;
    setIsSendingReply(true);
    const { data, error } = await supabase
      .from("recipe_comments")
      .insert({
        recipe_id: recipeId,
        user_id: user.id,
        content: replyContent.trim(),
        parent_id: replyingToId,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(t("comments.failedToAdd"));
    } else {
      setReplyingToId(null);
      setReplyContent("");
      if (data) {
        await createNotification(parentComment.user_id, "reply_to_comment", data.id);
        // Also notify recipe owner if different from parent comment author
        if (parentComment.user_id !== recipeOwnerId) {
          await createNotification(recipeOwnerId, "comment_on_recipe", data.id);
        }
      }
      fetchComments();
    }
    setIsSendingReply(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("recipe_comments").delete().eq("id", id);
    if (error) {
      toast.error(t("comments.failedToDelete"));
    } else {
      fetchComments();
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

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <div className={`flex gap-3 ${isReply ? "ml-8 mt-2" : ""}`}>
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="text-xs">
          {getInitials(comment.profiles?.display_name ?? null)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
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

        {/* Reply box */}
        {replyingToId === comment.id && (
          <div className="mt-2 flex gap-2">
            <Textarea
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder={t("comments.replyPlaceholder")}
              rows={2}
              className="flex-1 min-h-0 text-sm"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(comment); } }}
            />
            <div className="flex flex-col gap-1">
              <Button
                size="icon"
                onClick={() => handleSendReply(comment)}
                disabled={isSendingReply || !replyContent.trim()}
                className="h-7 w-7"
              >
                {isSendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setReplyingToId(null); setReplyContent(""); }} className="h-7 w-7">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 shrink-0">
        {user && !isReply && editingId !== comment.id && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            title={t("comments.reply")}
            onClick={() => {
              setReplyingToId(replyingToId === comment.id ? null : comment.id);
              setReplyContent("");
            }}
          >
            <CornerDownRight className="h-3 w-3" />
          </Button>
        )}
        {user?.id === comment.user_id && editingId !== comment.id && (
          <>
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
          </>
        )}
      </div>
    </div>
  );

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
        <div className="space-y-4">
          {comments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
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
