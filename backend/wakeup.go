package coolmaze

import (
	"fmt"
	"net/http"
)

func init() {
	//
	// Wake Up is a sort of manual (explicit) warmup request.
	// It should be triggered by all clients at startup (browser, mobile device) to
	// make sure the subsequent request won't face a cold start (Loading request).
	// See also https://cloud.google.com/appengine/docs/go/warmup-requests/
	//
	http.HandleFunc("/wakeup",
		func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			fmt.Fprintln(w, "ok")
			// Instance should be warm by now
		})
}
