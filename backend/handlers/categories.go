package handlers

import (
	"encoding/json"
	"net/http"
)

func CategoriesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Lazy-seed defaults if none present
	if err := ensureDefaultCategories(); err != nil {
		sendErrorResponse(w, "DB error (ensure categories)", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query(`SELECT category_id, name FROM categories ORDER BY name ASC`)
	if err != nil {
		sendErrorResponse(w, "DB error (list categories)", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var cats []categoryDTO
	for rows.Next() {
		var c categoryDTO
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			sendErrorResponse(w, "DB error (scan category)", http.StatusInternalServerError)
			return
		}
		cats = append(cats, c)
	}

	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    cats,
	})
}

func ensureDefaultCategories() error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM categories`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	names := []string{"General", "News", "Help", "Discussion", "Tech"}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO categories(name) VALUES(?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, n := range names {
		if _, err := stmt.Exec(n); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
