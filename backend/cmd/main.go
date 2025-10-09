package main

import (
	"fmt"
	"log"
	"net/http"
	"realtimeforum/backend/handlers"
	"realtimeforum/backend/models"
	"realtimeforum/backend/router"
	"realtimeforum/backend/ws"
	"realtimeforum/database"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db := models.InitDB("database/realTimeForumDatabase.db")
	defer db.Close()

	database.InsertTestUsers(db)
	
	handlers.SetDB(db)

	hub := ws.NewHub()
	go hub.Run()

	handlers.SetHub(hub)

	mux := http.NewServeMux()

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handlers.HandleWebSocket(hub, w, r)
	})

	mux.HandleFunc("/api/register", handlers.RegisterHandler)
	mux.HandleFunc("/api/login", handlers.LoginHandler)
	mux.HandleFunc("/api/session", handlers.SessionHandler)
	mux.HandleFunc("/api/logout", handlers.LogoutHandler)
	mux.HandleFunc("/api/contacts", handlers.GetAllUsersHandler)
	mux.HandleFunc("/api/user/id", handlers.GetUserIDHandler)
	mux.HandleFunc("/api/categories", handlers.CategoriesHandler) 
	mux.HandleFunc("/api/posts", handlers.PostsHandler)
	mux.HandleFunc("/api/posts/", handlers.PostSubresourceRouter)
	mux.HandleFunc("/api/profile", handlers.ProfileHandler)
	mux.HandleFunc("/api/private-messages", handlers.GetPrivateMessagesHandler)
	mux.HandleFunc("/api/private-messages/send", handlers.SendPrivateMessageHandler)
	mux.HandleFunc("/api/typing/start", handlers.StartTypingHandler)
	mux.HandleFunc("/api/typing/stop", handlers.StopTypingHandler)
	// mux.HandleFunc("/api/unread-counts", handlers.GetUnreadCountsHandler)
	// mux.HandleFunc("/api/mark-messages-read", handlers.MarkMessagesReadHandler)
	// mux.HandleFunc("/api/increment-unread-count", handlers.IncrementUnreadCountHandler)

	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("./frontend/assets"))))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./frontend/assets/uploads"))))

	mux.HandleFunc("/error", func(w http.ResponseWriter, r *http.Request) {
		statusCode := http.StatusInternalServerError
		message := "Internal server error"
		
		if statusParam := r.URL.Query().Get("status"); statusParam != "" {
			fmt.Sscanf(statusParam, "%d", &statusCode)
		}
		if msgParam := r.URL.Query().Get("message"); msgParam != "" {
			message = msgParam
		}
		
		router.ServeErrorPage(w, r, statusCode, message)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			err := router.ServeHTMLFile(w, r, "./frontend/index.html")
			if err != nil {
				router.ServeErrorPage(w, r, http.StatusInternalServerError, "Main page not found")
			}
			return
		}
		
		if strings.HasPrefix(r.URL.Path, "/assets/") || 
		   strings.HasPrefix(r.URL.Path, "/uploads/") ||
		   strings.HasPrefix(r.URL.Path, "/ws") ||
		   r.URL.Path == "/error" {
			return
		}
		
		if strings.HasPrefix(r.URL.Path, "/api/") {
			router.ServeErrorPage(w, r, http.StatusNotFound, "API endpoint not found")
			return
		}
		
		router.ServeErrorPage(w, r, http.StatusNotFound, "Page not found")
	})

	handlerWithRecovery := router.RecoveryMiddleware(mux)

	log.Println("Server started on http://localhost:8080")
	err := http.ListenAndServe(":8080", handlerWithRecovery)
	if err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}