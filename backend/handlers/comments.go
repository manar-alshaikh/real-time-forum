// handlers/comments.go
package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type commentDTO struct {
	CommentID int64     `json:"comment_id"`
	PostID    int64     `json:"post_id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	Likes     int       `json:"likes"`
	Dislikes  int       `json:"dislikes"`
}

type createCommentPayload struct {
	Content string `json:"content"`
}

type reactPayload struct {
	Type string `json:"type"` // "like" or "dislike"
}

// Fan out /api/posts/{id}/<subresource>
func PostSubresourceRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/posts/")
	parts := strings.Split(path, "/")
	if len(parts) < 1 {
		sendErrorResponse(w, "Not found", http.StatusNotFound)
		return
	}
	postID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || postID <= 0 {
		sendErrorResponse(w, "Invalid post id", http.StatusBadRequest)
		return
	}

	// No subresource? Let /api/posts GET/POST handle it.
	if len(parts) == 1 {
		if r.Method == http.MethodGet || r.Method == http.MethodPost {
			PostsHandler(w, r)
			return
		}
		sendErrorResponse(w, "Not found", http.StatusNotFound)
		return
	}

	switch parts[1] {
	case "comments":
		switch r.Method {
		case http.MethodGet:
			handleListComments(w, r, postID)
		case http.MethodPost:
			handleCreateComment(w, r, postID)
		default:
			sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	case "react":
		if r.Method != http.MethodPost {
			sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleReactPost(w, r, postID)
	default:
		sendErrorResponse(w, "Not found", http.StatusNotFound)
	}
}

func handleCreateComment(w http.ResponseWriter, r *http.Request, postID int64) {
	sess, err := GetSession(r)
	if err != nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var p createCommentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		sendErrorResponse(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	content := strings.TrimSpace(p.Content)
	if len(content) < 1 {
		sendErrorResponse(w, "Comment cannot be empty", http.StatusBadRequest)
		return
	}
	if len(content) > 4000 {
		sendErrorResponse(w, "Comment too long", http.StatusBadRequest)
		return
	}

	var ok int
	if err := db.QueryRow(`SELECT 1 FROM posts WHERE post_id=?`, postID).Scan(&ok); err != nil {
		if err == sql.ErrNoRows {
			sendErrorResponse(w, "Post not found", http.StatusNotFound)
			return
		}
		sendErrorResponse(w, "DB error", http.StatusInternalServerError)
		return
	}

	res, err := db.Exec(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?,?,?, CURRENT_TIMESTAMP)`,
		postID, sess.UserID, content)
	if err != nil {
		sendErrorResponse(w, "DB error (insert comment)", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()

	var username string
	_ = db.QueryRow(`SELECT username FROM users WHERE user_id=?`, sess.UserID).Scan(&username)

	var createdAt time.Time
	if err := db.QueryRow(`SELECT created_at FROM comments WHERE comment_id=?`, id).Scan(&createdAt); err != nil {
    createdAt = time.Now().UTC()
	}

	Emit("comment.created", map[string]any{
    "comment_id": id,
    "post_id":    postID,
    "user_id":    sess.UserID,
    "username":   username,
    "content":    content,
    "created_at": createdAt.UTC().Format(time.RFC3339),
	})

	json.NewEncoder(w).Encode(map[string]any{
		"success":    true,
		"comment_id": id,
		"message":    "Comment added",
	})
}

func handleListComments(w http.ResponseWriter, r *http.Request, postID int64) {
	q := r.URL.Query()
	limit := toInt(q.Get("limit"), 10)
	if limit < 1 || limit > 50 {
		limit = 10
	}
	beforeID := toInt64(q.Get("before_id"), 0)

	var rows *sql.Rows
	var err error
	if beforeID > 0 {
		rows, err = db.Query(`
SELECT c.comment_id, c.post_id, c.user_id, u.username, c.content, c.created_at,
COALESCE(SUM(CASE WHEN r.type='like' THEN 1 END),0) AS likes,
COALESCE(SUM(CASE WHEN r.type='dislike' THEN 1 END),0) AS dislikes
FROM comments c
JOIN users u ON u.user_id = c.user_id
LEFT JOIN reactions r ON r.comment_id = c.comment_id
WHERE c.post_id = ? AND c.comment_id < ?
GROUP BY c.comment_id
ORDER BY c.comment_id DESC
LIMIT ?`, postID, beforeID, limit)
	} else {
		rows, err = db.Query(`
SELECT c.comment_id, c.post_id, c.user_id, u.username, c.content, c.created_at,
COALESCE(SUM(CASE WHEN r.type='like' THEN 1 END),0) AS likes,
COALESCE(SUM(CASE WHEN r.type='dislike' THEN 1 END),0) AS dislikes
FROM comments c
JOIN users u ON u.user_id = c.user_id
LEFT JOIN reactions r ON r.comment_id = c.comment_id
WHERE c.post_id = ?
GROUP BY c.comment_id
ORDER BY c.comment_id DESC
LIMIT ?`, postID, limit)
	}
	if err != nil {
		sendErrorResponse(w, "DB error (list comments)", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var items []commentDTO
	for rows.Next() {
		var c commentDTO
		if err := rows.Scan(&c.CommentID, &c.PostID, &c.UserID, &c.Username, &c.Content, &c.CreatedAt, &c.Likes, &c.Dislikes); err != nil {
			sendErrorResponse(w, "DB error (scan comment)", http.StatusInternalServerError)
			return
		}
		items = append(items, c)
	}

	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}

	var nextBefore int64 = 0
	if len(items) > 0 {
		nextBefore = items[0].CommentID
	}

	json.NewEncoder(w).Encode(map[string]any{
		"success":    true,
		"data":       items,
		"nextCursor": nextBefore,
		"count":      len(items),
	})
}
