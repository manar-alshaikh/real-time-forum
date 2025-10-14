package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	sessionCookieName = "session_token"
	sessionDuration   = 24 * time.Hour
	cleanupInterval   = 1 * time.Hour
)

var (
	sessions      = make(map[string]Session)
	sessionMutex  = &sync.RWMutex{}
	sessionErrors = map[string]error{
		"not_found": errors.New("session not found"),
		"expired":   errors.New("session expired"),
		"invalid":   errors.New("invalid session"),
	}
)










func (s *Session) IsExpired() bool {
	return s.ExpiresAt.Before(time.Now())
}

func (s *Session) IsValid() bool {
	return s.SessionID != "" && s.UserID > 0 && !s.IsExpired()
}

func init() {
	go cleanupExpiredSessions()
}

func cleanupExpiredSessions() {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		cleanupDBExpiredSessions()
		cleanupMemoryExpiredSessions()
	}
}

func cleanupDBExpiredSessions() {
	if db == nil {
		return
	}

	query := "DELETE FROM sessions WHERE expires_at <= datetime('now')"
	_, err := db.Exec(query)
	if err != nil {
		return
	}
}

func cleanupMemoryExpiredSessions() {
	now := time.Now()
	sessionMutex.Lock()
	defer sessionMutex.Unlock()

	for token, session := range sessions {
		if session.ExpiresAt.Before(now) {
			delete(sessions, token)
		}
	}
}

func CreateSession(userID int64, username string, w http.ResponseWriter) error {
	if userID <= 0 || username == "" {
		return errors.New("invalid user data for session creation")
	}

	sessionMutex.Lock()
	for token, existingSession := range sessions {
		if existingSession.Username == username {
			delete(sessions, token)
			if db != nil {
				query := "DELETE FROM sessions WHERE session_id = ?"
				db.Exec(query, token)
			}
			break
		}
	}
	sessionMutex.Unlock()

	sessionToken := uuid.New().String()
	now := time.Now()
	expiresAt := now.Add(sessionDuration)

	session := Session{
		SessionID: sessionToken,
		UserID:    userID,
		Username:  username,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}

	
	if db != nil {
		query := `INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)`
		_, err := db.Exec(query, session.SessionID, session.UserID, session.ExpiresAt)
		if err != nil {
			
		}
	}

	sessionMutex.Lock()
	sessions[sessionToken] = session
	sessionMutex.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionToken,
		Expires:  expiresAt,
		HttpOnly: true,
		Path:     "/",
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	})

	return nil
}

func GetSession(r *http.Request) (*Session, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		if errors.Is(err, http.ErrNoCookie) {
			return nil, sessionErrors["not_found"]
		}
		return nil, fmt.Errorf("cookie error: %w", err)
	}

	if cookie.Value == "" {
		return nil, sessionErrors["invalid"]
	}

	
	sessionMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionMutex.RUnlock()

	if exists {
		if session.IsExpired() {
			
			deleteSessionFromStorage(session.SessionID)
			return nil, sessionErrors["expired"]
		}
		if !session.IsValid() {
			return nil, sessionErrors["invalid"]
		}
		return &session, nil
	}

	
	if db != nil {
		session, err = getSessionFromDB(cookie.Value)
		if err != nil {
			return nil, err
		}

		
		sessionMutex.Lock()
		sessions[session.SessionID] = session
		sessionMutex.Unlock()

		return &session, nil
	}

	return nil, sessionErrors["not_found"]
}

func getSessionFromDB(sessionToken string) (Session, error) {
	var session Session
	query := `
	SELECT s.session_id, s.user_id, u.username, s.expires_at 
	FROM sessions s 
	JOIN users u ON s.user_id = u.user_id 
	WHERE s.session_id = ? AND s.expires_at > datetime('now')
	`

	err := db.QueryRow(query, sessionToken).Scan(
		&session.SessionID, &session.UserID, &session.Username, &session.ExpiresAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return Session{}, sessionErrors["not_found"]
		}
		return Session{}, fmt.Errorf("database error: %w", err)
	}

	return session, nil
}

func deleteSessionFromStorage(sessionToken string) {
	
	sessionMutex.Lock()
	delete(sessions, sessionToken)
	sessionMutex.Unlock()

	
	if db != nil {
		query := "DELETE FROM sessions WHERE session_id = ?"
		db.Exec(query, sessionToken)
	}
}

func RefreshSession(w http.ResponseWriter, r *http.Request) error {
	session, err := GetSession(r)
	if err != nil {
		return err
	}

	newExpiresAt := time.Now().Add(sessionDuration)

	
	if db != nil {
		query := "UPDATE sessions SET expires_at = ? WHERE session_id = ?"
		db.Exec(query, newExpiresAt, session.SessionID)
	}

	sessionMutex.Lock()
	session.ExpiresAt = newExpiresAt
	sessions[session.SessionID] = *session
	sessionMutex.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    session.SessionID,
		Expires:  newExpiresAt,
		HttpOnly: true,
		Path:     "/",
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	return nil
}

func DeleteSession(w http.ResponseWriter, r *http.Request) error {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		if errors.Is(err, http.ErrNoCookie) {
			return nil
		}
		return fmt.Errorf("cookie error: %w", err)
	}

	deleteSessionFromStorage(cookie.Value)

	
	http.SetCookie(w, &http.Cookie{
		Name:    sessionCookieName,
		Value:   "",
		Expires: time.Now().Add(-1 * time.Hour),
		Path:    "/",
		Secure:  true,
	})

	return nil
}

func GetSessionCount() int {
	sessionMutex.RLock()
	defer sessionMutex.RUnlock()
	return len(sessions)
}
