package router

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

func ServeHTMLFile(w http.ResponseWriter, r *http.Request, filepath string) error {
	if _, err := os.Stat(filepath); os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", filepath)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	http.ServeFile(w, r, filepath)
	return nil
}

func ServeErrorPage(w http.ResponseWriter, r *http.Request, statusCode int, errorMessage string) {
	if strings.Contains(r.Header.Get("Accept"), "application/json") ||
		strings.HasPrefix(r.URL.Path, "/api") {

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   errorMessage,
			"code":    statusCode,
		})
		return
	}

	w.WriteHeader(statusCode)

	htmlContent, err := os.ReadFile("./frontend/err.html")
	if err != nil {
		log.Printf("Failed to read error page, using fallback: %v", err)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `
            <!DOCTYPE html>
            <html>
            <head><title>Error %d</title></head>
            <body>
                <h1>%d %s</h1>
                <p>%s</p>
                <a href="/">Go Home</a>
            </body>
            </html>`,
			statusCode, statusCode, http.StatusText(statusCode), errorMessage)
		return
	}

	htmlStr := string(htmlContent)
	htmlStr = strings.Replace(htmlStr,
		`const status = urlParams.get('status') || '500';`,
		fmt.Sprintf(`const status = '%d';`, statusCode), 1)
	htmlStr = strings.Replace(htmlStr,
		`const message = urlParams.get('message') || 'Internal server error';`,
		fmt.Sprintf(`const message = '%s';`, strings.ReplaceAll(http.StatusText(statusCode), "'", "\\'")), 1)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(htmlStr))
}

func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Server panic recovered: %v", err)
				ServeErrorPage(w, r, http.StatusInternalServerError, "Internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}