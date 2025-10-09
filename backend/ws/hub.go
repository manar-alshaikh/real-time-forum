package ws

import (
	"github.com/gorilla/websocket"
)

type Client struct {
	Hub     *Hub
	Conn    *websocket.Conn
	Send    chan []byte
	UserID  int   
	Username string
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	UserClients map[int][]*Client 
}

func NewHub() *Hub {
	return &Hub{
		Clients:     make(map[*Client]bool),
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		UserClients: make(map[int][]*Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.Clients[client] = true
			if client.UserID > 0 {
				h.UserClients[client.UserID] = append(h.UserClients[client.UserID], client)
			}
			
		case client := <-h.Unregister:
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
				if client.UserID > 0 {
					if clients, exists := h.UserClients[client.UserID]; exists {
						for i, c := range clients {
							if c == client {
								h.UserClients[client.UserID] = append(clients[:i], clients[i+1:]...)
								break
							}
						}
						if len(h.UserClients[client.UserID]) == 0 {
							delete(h.UserClients, client.UserID)
						}
					}
				}
			}
			
		case message := <-h.Broadcast:
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
		}
	}
}

func (h *Hub) SendToUser(userID int, message []byte) {
	if clients, exists := h.UserClients[userID]; exists {
		for _, client := range clients {
			select {
			case client.Send <- message:
			default:
				close(client.Send)
				delete(h.Clients, client)
			}
		}
	}
}

func (h *Hub) BroadcastExcept(senderID int, message []byte) {
	for client := range h.Clients {
		if client.UserID != senderID {
			select {
			case client.Send <- message:
			default:
				close(client.Send)
				delete(h.Clients, client)
			}
		}
	}
}