package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

type reactResult struct {
	Likes       int    `json:"likes"`
	Dislikes    int    `json:"dislikes"`
	UserReaction string `json:"userReaction"` // "", "like", "dislike"
}

// POST /api/posts/{postID}/react  { "type": "like" | "dislike" }
// Behavior:
// - If no previous reaction: insert that reaction.
// - If previous == same type: remove reaction (toggle off).
// - If previous == other type: switch to new type.
// Returns updated counts + current user's reaction.
func handleReactPost(w http.ResponseWriter, r *http.Request, postID int64) {
	sess, err := GetSession(r)
	if err != nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var p reactPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		sendErrorResponse(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	t := strings.ToLower(strings.TrimSpace(p.Type))
	if t != "like" && t != "dislike" {
		sendErrorResponse(w, "type must be 'like' or 'dislike'", http.StatusBadRequest)
		return
	}

	// Ensure post exists
	var ok int
	if err := db.QueryRow(`SELECT 1 FROM posts WHERE post_id=?`, postID).Scan(&ok); err != nil {
		if err == sql.ErrNoRows {
			sendErrorResponse(w, "Post not found", http.StatusNotFound)
			return
		}
		sendErrorResponse(w, "DB error", http.StatusInternalServerError)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		sendErrorResponse(w, "DB error (begin)", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// What does the user currently have?
	var curr string
	err = tx.QueryRow(`SELECT type FROM reactions WHERE user_id=? AND post_id=? AND comment_id IS NULL`, sess.UserID, postID).Scan(&curr)
	if err == sql.ErrNoRows {
		curr = ""
	} else if err != nil {
		sendErrorResponse(w, "DB error (select)", http.StatusInternalServerError)
		return
	}

	switch {
	case curr == "":
		// insert
		if _, err := tx.Exec(`INSERT INTO reactions (user_id, post_id, comment_id, type) VALUES (?,?,NULL,?)`,
			sess.UserID, postID, t); err != nil {
			sendErrorResponse(w, "DB error (insert)", http.StatusInternalServerError)
			return
		}
	case curr == t:
		// remove (toggle off)
		if _, err := tx.Exec(`DELETE FROM reactions WHERE user_id=? AND post_id=? AND comment_id IS NULL`, sess.UserID, postID); err != nil {
			sendErrorResponse(w, "DB error (delete)", http.StatusInternalServerError)
			return
		}
		t = "" // now no reaction
	default:
		// switch
		if _, err := tx.Exec(`UPDATE reactions SET type=? WHERE user_id=? AND post_id=? AND comment_id IS NULL`,
			t, sess.UserID, postID); err != nil {
			sendErrorResponse(w, "DB error (update)", http.StatusInternalServerError)
			return
		}
	}

	// counts
	var likes, dislikes int
	if err := tx.QueryRow(`
SELECT 
  COALESCE(SUM(CASE WHEN type='like' THEN 1 END),0) AS likes,
  COALESCE(SUM(CASE WHEN type='dislike' THEN 1 END),0) AS dislikes
FROM reactions WHERE post_id=? AND comment_id IS NULL`, postID).Scan(&likes, &dislikes); err != nil {
		sendErrorResponse(w, "DB error (count)", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		sendErrorResponse(w, "DB error (commit)", http.StatusInternalServerError)
		return
	}

	Emit("post.reaction", map[string]any{
	"post_id":  postID,
	"likes":    likes,
	"dislikes": dislikes,
	})
	
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data": reactResult{
			Likes:        likes,
			Dislikes:     dislikes,
			UserReaction: t, // "", "like", or "dislike"
		},
	})
}
