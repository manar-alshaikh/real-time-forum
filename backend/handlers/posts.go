package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type categoryDTO struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type postDTO struct {
	PostID     int64        `json:"post_id"`
	UserID     int64        `json:"user_id"`
	Username   string       `json:"username"`
	Title      string       `json:"title"`
	Content    string       `json:"content"`
	Image      *string      `json:"image,omitempty"`
	CreatedAt  time.Time    `json:"created_at"`
	Likes      int          `json:"likes"`
	Dislikes   int          `json:"dislikes"`
	Categories []categoryDTO `json:"categories"`
	MyReaction string `json:"my_reaction,omitempty"`
}

type createPostPayload struct {
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	Categories []int64 `json:"categories"`
	Image      *string `json:"image,omitempty"`
}

// /api/posts
func PostsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleListPosts(w, r)
	case http.MethodPost:
		handleCreatePost(w, r)
	default:
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCreatePost(w http.ResponseWriter, r *http.Request) {
	// must be logged in
	session, err := GetSession(r)
	if err != nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var payload createPostPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		sendErrorResponse(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	title := strings.TrimSpace(payload.Title)
	content := strings.TrimSpace(payload.Content)
	if len(title) < 3 {
		sendErrorResponse(w, "Title must be at least 3 characters", http.StatusBadRequest)
		return
	}
	if len(content) < 5 {
		sendErrorResponse(w, "Content must be at least 5 characters", http.StatusBadRequest)
		return
	}
	if len(payload.Categories) == 0 {
		sendErrorResponse(w, "Select at least one category", http.StatusBadRequest)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		sendErrorResponse(w, "DB error (begin tx)", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO posts (user_id, title, content, image, created_at) 
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		session.UserID, title, content, payload.Image)
	if err != nil {
		sendErrorResponse(w, "DB error (insert post)", http.StatusInternalServerError)
		return
	}

	postID, err := res.LastInsertId()
	if err != nil {
		sendErrorResponse(w, "DB error (post id)", http.StatusInternalServerError)
		return
	}

	// link categories
	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)`)
	if err != nil {
		sendErrorResponse(w, "DB error (prepare link cats)", http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	for _, cid := range payload.Categories {
		if _, err := stmt.Exec(postID, cid); err != nil {
			sendErrorResponse(w, "DB error (link category)", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		sendErrorResponse(w, "DB error (commit)", http.StatusInternalServerError)
		return
	}

	Emit("post.created", map[string]any{
	"post_id": postID, // int64 from res.LastInsertId()
	})
	// return the created post (minimal)
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "Post created",
		"post_id": postID,
	})
}

func handleListPosts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := clamp(toInt(q.Get("page"), 1), 1, 1000000)
	limit := clamp(toInt(q.Get("limit"), 10), 1, 50)
	offset := (page - 1) * limit

	search := strings.TrimSpace(q.Get("search"))
	catID := toInt64(q.Get("category_id"), 0)

	// Try session; if not logged-in, userID=0 (won't match)
	var userID int64 = 0
	if sess, err := GetSession(r); err == nil {
		userID = sess.UserID
	}

	var (
		args      []any
		sbSelect  strings.Builder
		sbWhere   strings.Builder
		sbJoins   strings.Builder
	)

	sbSelect.WriteString(`
SELECT p.post_id, p.user_id, u.username, p.title, p.content, p.image, p.created_at,
COALESCE(SUM(CASE WHEN r.type='like' THEN 1 ELSE 0 END),0) AS likes,
COALESCE(SUM(CASE WHEN r.type='dislike' THEN 1 ELSE 0 END),0) AS dislikes,
ur.type AS my_reaction
FROM posts p
JOIN users u ON u.user_id = p.user_id
LEFT JOIN reactions r ON r.post_id = p.post_id AND r.comment_id IS NULL
LEFT JOIN reactions ur ON ur.post_id = p.post_id AND ur.comment_id IS NULL AND ur.user_id = ?
`)

	args = append(args, userID)

	if catID > 0 {
		sbJoins.WriteString(`JOIN post_categories pc ON pc.post_id = p.post_id `)
		addWhere(&sbWhere, `pc.category_id = ?`)
		args = append(args, catID)
	}
	if search != "" {
		addWhere(&sbWhere, `(p.title LIKE ? OR p.content LIKE ?)`)
		args = append(args, "%"+search+"%", "%"+search+"%")
	}

	query := sbSelect.String() + sbJoins.String()
	if sbWhere.Len() > 0 {
		query += "WHERE " + sbWhere.String()
	}
	query += `
GROUP BY p.post_id
ORDER BY p.created_at DESC
LIMIT ? OFFSET ?`

	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		sendErrorResponse(w, "DB error (list posts)", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []postDTO
	var postIDs []int64

	for rows.Next() {
		var p postDTO
		var myReaction sql.NullString
		if err := rows.Scan(&p.PostID, &p.UserID, &p.Username, &p.Title, &p.Content, &p.Image, &p.CreatedAt, &p.Likes, &p.Dislikes, &myReaction); err != nil {
			sendErrorResponse(w, "DB error (scan)", http.StatusInternalServerError)
			return
		}
		if myReaction.Valid {
			p.MyReaction = myReaction.String
		}
		posts = append(posts, p)
		postIDs = append(postIDs, p.PostID)
	}

	if len(postIDs) > 0 {
		if err := attachCategories(posts, postIDs); err != nil {
			sendErrorResponse(w, "DB error (load categories)", http.StatusInternalServerError)
			return
		}
	}

	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    posts,
		"page":    page,
		"limit":   limit,
	})
}


func attachCategories(posts []postDTO, ids []int64) error {
	// build IN (?, ?, ?)
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = strings.TrimRight(placeholders, ",")

	args := make([]any, len(ids))
	for i, v := range ids {
		args[i] = v
	}

	q := fmt.Sprintf(`
SELECT pc.post_id, c.category_id, c.name
FROM post_categories pc 
JOIN categories c ON c.category_id = pc.category_id
WHERE pc.post_id IN (%s)
ORDER BY c.name ASC`, placeholders)

	rows, err := db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	cmap := make(map[int64][]categoryDTO)
	for rows.Next() {
		var pid, cid int64
		var name string
		if err := rows.Scan(&pid, &cid, &name); err != nil {
			return err
		}
		cmap[pid] = append(cmap[pid], categoryDTO{ID: cid, Name: name})
	}

	// write back
	for i := range posts {
		posts[i].Categories = cmap[posts[i].PostID]
	}
	return nil
}

func toInt(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}
func toInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}
func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
func addWhere(sb *strings.Builder, clause string) {
	if sb.Len() > 0 {
		sb.WriteString(" AND ")
	}
	sb.WriteString(clause)
}
