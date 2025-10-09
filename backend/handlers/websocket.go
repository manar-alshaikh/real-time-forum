package handlers

import (
	"net/http"
	"realtimeforum/backend/ws"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func HandleWebSocket(hub *ws.Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Could not open WebSocket", http.StatusBadRequest)
		return
	}

	// Get user session to identify the WebSocket connection
	session, err := GetSession(r)
	var userID int
	var username string
	
	if err == nil && session != nil {
		userID = int(session.UserID)
		username = session.Username
	}

	client := &ws.Client{
		Hub:      hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		UserID:   userID,
		Username: username,
	}

	hub.Register <- client

	go client.WritePump()
	client.ReadPump()
}