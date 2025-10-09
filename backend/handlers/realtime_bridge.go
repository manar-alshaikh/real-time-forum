package handlers

import (
	"encoding/json"
	"realtimeforum/backend/ws"
)

var realtimeHub *ws.Hub

// Call this once at startup (in main.go) after creating the hub.
func SetHub(h *ws.Hub) { realtimeHub = h }

// Emit a server-side event to all clients, JSON shape: {"type": "...", "data": {...}}
func Emit(eventType string, data any) {
	if realtimeHub == nil { return }
	msg, err := json.Marshal(map[string]any{
		"type": eventType,
		"data": data,
	})
	if err != nil { return }
	realtimeHub.Broadcast <- msg
}
